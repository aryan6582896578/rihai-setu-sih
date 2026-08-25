$ErrorActionPreference = "Continue"
$ApiBase = "http://localhost:4000/api/v1"

function Invoke-Api {
    param([string]$Method, [string]$Url, [hashtable]$Headers, $Body)
    try {
        $p = @{ Method = $Method; Uri = $Url; Headers = $Headers; UseBasicParsing = $true; TimeoutSec = 20; ErrorAction = "Stop" }
        if ($Body) { $p.Body = ($Body | ConvertTo-Json); $p.ContentType = "application/json" }
        $resp = Invoke-WebRequest @p
        return @{ Status = [int]$resp.StatusCode; Data = ($resp.Content | ConvertFrom-Json) }
    } catch {
        $code = 0
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        return @{ Status = $code; Error = $_.ErrorDetails.Message }
    }
}

function Login($email) {
    $r = Invoke-RestMethod -Uri "http://localhost:4000/api/v1/auth/login" -Method Post -ContentType "application/json" -Body ('{"email":"' + $email + '","password":"Passw0rd!23"}')
    return @{ Authorization = "Bearer $($r.accessToken)" }
}

$supH = Login "superintendent1@rihai.gov.in"
$dlsaH = Login "dlsa@rihai.gov.in"
$staffH = Login "staff1a@rihai.gov.in"
$adminH = Login "superadmin@rihai.gov.in"

Write-Output "=== prompt 6: notifications ==="
$notif = Invoke-Api GET "$ApiBase/notifications" $dlsaH
Write-Output ("dlsa notifications: status=" + $notif.Status + " rows=" + $notif.Data.data.Count + " unread=" + $notif.Data.unread)
if ($notif.Data.data.Count -gt 0) {
    $first = $notif.Data.data[0].id
    $mr = Invoke-Api POST "$ApiBase/notifications/$first/mark-read" $dlsaH
    Write-Output ("mark-read: status=" + $mr.Status)
    $notif2 = Invoke-Api GET "$ApiBase/notifications" $dlsaH
    Write-Output ("unread after mark-read: " + $notif2.Data.unread)
}
$staffNotif = Invoke-Api GET "$ApiBase/notifications" $staffH
Write-Output ("staff notifications: rows=" + $staffNotif.Data.data.Count)

Write-Output ""
Write-Output "=== prompt 6: compliance ==="
$jailsResp = Invoke-RestMethod -Uri "$ApiBase/jails?pageSize=5" -Headers $supH
$jailId = $jailsResp.data[0].id
Write-Output ("jails fetch: count=" + $jailsResp.data.Count + " jailId=" + $jailId)
if (-not $jailId) { Write-Output "ABORT: no jail id"; exit 1 }
$from = (Get-Date).AddDays(-120).ToString("yyyy-MM-dd")
$to = (Get-Date).ToString("yyyy-MM-dd")
$rep = Invoke-Api GET "$ApiBase/jails/$jailId/compliance-report?from=$from&to=$to" $supH
Write-Output ("report: status=" + $rep.Status + " eligible=" + $rep.Data.data.eligibleIdentified + " filed=" + $rep.Data.data.applicationsFiled + " released=" + $rep.Data.data.releasesCompleted + " avgDays=" + $rep.Data.data.avgDaysFlaggedToReleased)

$csv = Invoke-Api GET "$ApiBase/jails/$jailId/compliance-report/export?from=$from&to=$to&format=csv" $supH
Write-Output ("csv export: status=" + $csv.Status)

$xls = Invoke-Api GET "$ApiBase/jails/$jailId/compliance-report/export?from=$from&to=$to&format=xlsx" $supH
Write-Output ("xls export: status=" + $xls.Status)

$pdf = Invoke-Api GET "$ApiBase/jails/$jailId/compliance-report/export?from=$from&to=$to&format=pdf" $supH
Write-Output ("pdf(html) export: status=" + $pdf.Status + " url=" + $pdf.Data.data.url)

$rollupRep = Invoke-Api GET "$ApiBase/compliance-report/compliance-report?from=$from&to=$to" $adminH
Write-Output ("rollup: status=" + $rollupRep.Status + " eligible=" + $rollupRep.Data.data.eligibleIdentified + " filed=" + $rollupRep.Data.data.applicationsFiled)

$staffRollup = Invoke-Api GET "$ApiBase/compliance-report/compliance-report?from=$from&to=$to" $staffH
Write-Output ("rollup as staff -> " + $staffRollup.Status + " (expect 403)")
