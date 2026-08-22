param(
    [string]$ApiBase = "http://localhost:4000",
    [string]$WebBase = "http://localhost:5173"
)

$script:passCount = 0
$script:failCount = 0
$script:failures = New-Object System.Collections.Generic.List[string]
$script:ApiBase = $ApiBase

function Test-Result {
    param([string]$Name, [bool]$Condition, [string]$Detail = "")
    if ($Condition) {
        $script:passCount++
        Write-Output ("PASS  {0}" -f $Name)
    } else {
        $script:failCount++
        $line = "FAIL  {0}  {1}" -f $Name, $Detail
        $script:failures.Add($line)
        Write-Output $line
    }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Url,
        $Body,
        [hashtable]$Headers,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session
    )
    try {
        $params = @{ Method = $Method; Uri = $Url; ErrorAction = "Stop"; TimeoutSec = 20 }
        if ($Body -ne $null) {
            $params.Body = ($Body | ConvertTo-Json -Depth 5)
            $params.ContentType = "application/json"
        }
        if ($Headers) { $params.Headers = $Headers }
        if ($Session) { $params.WebSession = $Session }
        $resp = $null
        try {
            $resp = Invoke-WebRequest @params -UseBasicParsing
        } catch {
            # One silent retry for transient connect failures (WPAD/proxy first-hit quirks).
            if ($_.Exception.Response -eq $null) {
                Start-Sleep -Milliseconds 800
                $resp = Invoke-WebRequest @params -UseBasicParsing
            } else {
                throw
            }
        }
        $data = $null
        if ($resp.Content) {
            try { $data = $resp.Content | ConvertFrom-Json } catch { $data = $resp.Content }
        }
        return @{ Status = [int]$resp.StatusCode; Data = $data }
    } catch {
        $code = -1
        try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = 0 }
        return @{ Status = $code; Error = $_.ErrorDetails.Message }
    }
}

# Login helper: retries once after sleeping out the 5/min/IP rate-limit window.
function Invoke-Login {
    param([string]$Email, [string]$Password)
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        try {
            $newSess = $null
            $raw = Invoke-WebRequest -Uri "$($script:ApiBase)/api/v1/auth/login" `
                -Method Post -ContentType "application/json" `
                -Body (@{ email = $Email; password = $Password } | ConvertTo-Json) `
                -SessionVariable newSess -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
            return @{ Status = 200; Session = $newSess; Body = ($raw.Content | ConvertFrom-Json) }
        } catch {
            $code = -1
            try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = 0 }
            if ($code -eq 429 -and $attempt -eq 0) {
                Write-Output "      (rate-limited by design -- waiting 65s for window reset)"
                Start-Sleep -Seconds 65
                continue
            }
            return @{ Status = $code; Session = $null; Body = $null }
        }
    }
    return @{ Status = -1; Session = $null; Body = $null }
}

Write-Output "=== RIHAI SETU smoke test ==="
Write-Output ("API: {0}   WEB: {1}" -f $ApiBase, $WebBase)
Write-Output ""

# ---------- infrastructure ----------
$health = Invoke-Api -Method Get -Url "$ApiBase/healthz"
Test-Result "API healthz responds" ($health.Status -eq 200) ("status=" + $health.Status)

if ($health.Status -ne 200) {
    Write-Output ""
    Write-Output "ABORT: API is not reachable -- fix infrastructure before running the suite."
    exit 1
}

$webHome = Invoke-Api -Method Get -Url "$WebBase/"
Test-Result "Vite dev server serves app" ($webHome.Status -eq 200) ("status=" + $webHome.Status)

# ---------- auth ----------
$badLogin = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/login" -Body @{ email = "superintendent1@rihai.gov.in"; password = "totally-wrong" }
Test-Result "Wrong password rejected 401" ($badLogin.Status -eq 401) ("status=" + $badLogin.Status)

$malformed = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/login" -Body @{ email = "not-an-email"; password = "x" }
Test-Result "Malformed login -> 400 VALIDATION_ERROR" ($malformed.Status -eq 400 -and $malformed.Error -match "VALIDATION_ERROR") ("status=" + $malformed.Status + " body=" + $malformed.Error)

$loginSuper = Invoke-Login -Email "superintendent1@rihai.gov.in" -Password "Passw0rd!23"
$superTok = $loginSuper.Body.accessToken
$superHdr = @{ Authorization = "Bearer $superTok" }
Test-Result "Superintendent login returns token+user" ($loginSuper.Status -eq 200 -and $superTok -and $loginSuper.Body.user.role -eq "jail_superintendent") ("status=" + $loginSuper.Status)

$me = Invoke-Api -Method Get -Url "$ApiBase/api/v1/auth/me" -Headers $superHdr
Test-Result "GET /auth/me hydrates profile" ($me.Status -eq 200 -and $me.Data.data.email -eq "superintendent1@rihai.gov.in") ("status=" + $me.Status)

$noAuth = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails"
Test-Result "GET /jails without JWT -> 401" ($noAuth.Status -eq 401) ("status=" + $noAuth.Status)

$refresh = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/refresh" -Session $loginSuper.Session
Test-Result "POST /auth/refresh rotates access token" ($refresh.Status -eq 200 -and $refresh.Data.accessToken.Length -gt 20) ("status=" + $refresh.Status)

$forgot = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/forgot-password" -Body @{ email = "superintendent1@rihai.gov.in" }
Test-Result "Forgot-password responds generically" ($forgot.Status -eq 200) ("status=" + $forgot.Status)

# ---------- jails ----------
$jails = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails?page=1&pageSize=10" -Headers $superHdr
Test-Result "Superintendent sees own jail list" ($jails.Status -eq 200 -and $jails.Data.total -ge 1) ("total=" + $jails.Data.total)
$rampur = $jails.Data.data | Where-Object { $_.code -eq "UP-CF-RMP" } | Select-Object -First 1
Test-Result "Rampur jail present with occupancy fields" ($null -ne $rampur -and $rampur.occupancyPct -gt 0) ""
$jailId = $rampur.id

$loginAdmin = Invoke-Login -Email "superadmin@rihai.gov.in" -Password "Passw0rd!23"
$adminHdr = @{ Authorization = "Bearer $($loginAdmin.Body.accessToken)" }
$adminJails = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails" -Headers $adminHdr
Test-Result "Super admin sees ALL 5 jails" ($adminJails.Status -eq 200 -and $adminJails.Data.total -eq 5) ("total=" + $adminJails.Data.total)

$detail = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$jailId" -Headers $superHdr
Test-Result "GET /jails/:id detail accessible to member" ($detail.Status -eq 200 -and $detail.Data.data.code -eq "UP-CF-RMP") ("status=" + $detail.Status)

$stats = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$jailId/stats" -Headers $superHdr
$s = $stats.Data.data
Test-Result "Stats: occupancy/capacity/counts populate" (
    $stats.Status -eq 200 -and $s.currentOccupancy -gt 0 -and $s.sanctionedCapacity -gt 0 -and $s.undertrialCount -gt 0 -and $s.staffCount -gt 0
) ("occupancy=" + $s.currentOccupancy + "/" + $s.sanctionedCapacity)

Test-Result "Stats: recent activity feed non-empty" ($s.recentActivity.Count -gt 0) ("count=" + $s.recentActivity.Count)

# ---------- cross-jail RBAC ----------
$loginSuper2 = Invoke-Login -Email "superintendent2@rihai.gov.in" -Password "Passw0rd!23"
$hdr2 = @{ Authorization = "Bearer $($loginSuper2.Body.accessToken)" }
$cross = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$jailId/stats" -Headers $hdr2
Test-Result "Non-member superintendent blocked (403 JAIL_ACCESS_DENIED)" ($cross.Status -eq 403 -and $cross.Error -match "JAIL_ACCESS_DENIED") ("status=" + $cross.Status)

$ghost = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/does-not-exist/stats" -Headers $superHdr
Test-Result "Unknown jail -> 404" ($ghost.Status -eq 404) ("status=" + $ghost.Status)

# ---------- stall list + escalation ----------
$stalls = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$jailId/stall-list" -Headers $superHdr
$rows = @()
if ($stalls.Status -eq 200) { $rows = @($stalls.Data.data) }
Test-Result "Stall list computes stalled applications" ($rows.Count -gt 0) ("count=" + $rows.Count)

if ($rows.Count -ge 2) {
    $sorted = $true
    for ($i = 0; $i -lt $rows.Count - 1; $i++) {
        if ($rows[$i].daysStalled -lt $rows[$i + 1].daysStalled) { $sorted = $false }
    }
    Test-Result "Stall rows sorted by days-stalled desc" $sorted ""
} else {
    Test-Result "Stall rows sorted by days-stalled desc" ($rows.Count -eq 1) "only one row"
}

$escalateTarget = $rows[0].applicationId
$esc = Invoke-Api -Method Post -Url "$ApiBase/api/v1/applications/$escalateTarget/escalate" -Headers $superHdr
Test-Result "Escalate sets escalated flag + timestamp" ($esc.Status -eq 200 -and $esc.Data.data.escalated -eq $true -and $esc.Data.data.escalatedAt) ("status=" + $esc.Status)

$escAgain = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$jailId/stall-list" -Headers $superHdr
$escRow = @($escAgain.Data.data) | Where-Object { $_.applicationId -eq $escalateTarget } | Select-Object -First 1
Test-Result "Escalation state persists across views" ($escRow.escalated -eq $true -and $escRow.escalatedAt) ""

# ---------- staff management ----------
$loginStaff = Invoke-Login -Email "staff1@rihai.gov.in" -Password "Passw0rd!23"
$hdrStaff = @{ Authorization = "Bearer $($loginStaff.Body.accessToken)" }

$staffForbidden = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$jailId/staff" -Headers $hdrStaff
Test-Result "jail_staff forbidden from employee management" ($staffForbidden.Status -eq 403) ("status=" + $staffForbidden.Status)

$staffList = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$jailId/staff" -Headers $superHdr
Test-Result "Superintendent lists staff (responds, not hangs)" ($staffList.Status -eq 200 -and $staffList.Data.data.Count -ge 2) ("status=" + $staffList.Status + " count=" + $staffList.Data.data.Count)

$attach = Invoke-Api -Method Post -Url "$ApiBase/api/v1/jails/$jailId/staff" -Headers $superHdr -Body @{ mode = "existing"; email = "viewer@rihai.gov.in"; roleAtJail = "viewer" }
Test-Result "Attach existing user by email (201)" ($attach.Status -eq 201 -and $attach.Data.data.staff.email -eq "viewer@rihai.gov.in") ("status=" + $attach.Status)
$attachedUserId = $attach.Data.data.staff.userId

$uniqueEmail = "smoke.staff.{0}@rihai.gov.in" -f (Get-Random -Maximum 999999)
$created = Invoke-Api -Method Post -Url "$ApiBase/api/v1/jails/$jailId/staff" -Headers $superHdr -Body @{ mode = "new"; email = $uniqueEmail; name = "Smoke Test Officer"; roleAtJail = "jail_staff" }
$tempPassword = $created.Data.data.temporaryPassword
Test-Result "Create new staff returns one-time temp password" ($created.Status -eq 201 -and $tempPassword) ("status=" + $created.Status)
$newUserId = $created.Data.data.staff.userId

$dup = Invoke-Api -Method Post -Url "$ApiBase/api/v1/jails/$jailId/staff" -Headers $superHdr -Body @{ mode = "new"; email = $uniqueEmail; name = "Duplicate"; roleAtJail = "jail_staff" }
Test-Result "Duplicate email creation -> 409 CONFLICT" ($dup.Status -eq 409) ("status=" + $dup.Status)

$roleChange = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/jails/$jailId/staff/$attachedUserId" -Headers $superHdr -Body @{ roleAtJail = "dlsa_lawyer" }
Test-Result "PATCH edits role_at_jail" ($roleChange.Status -eq 200 -and $roleChange.Data.data.staff.roleAtJail -eq "dlsa_lawyer") ("status=" + $roleChange.Status)

$remove = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/jails/$jailId/staff/$attachedUserId" -Headers $superHdr -Body @{ isActive = $false }
Test-Result "Deactivate removes JailAccess row softly" ($remove.Status -eq 200 -and $remove.Data.data.removed -eq $true) ("status=" + $remove.Status)

$cleanup = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/jails/$jailId/staff/$newUserId" -Headers $superHdr -Body @{ isActive = $false }
Test-Result "Cleanup removes smoke-created staff" ($cleanup.Status -eq 200) ("status=" + $cleanup.Status)

# ---------- role-scoped escalation ----------
$escByStaff = Invoke-Api -Method Post -Url "$ApiBase/api/v1/applications/$escalateTarget/escalate" -Headers $hdrStaff
Test-Result "jail_staff CAN escalate (operational role)" ($escByStaff.Status -eq 200) ("status=" + $escByStaff.Status)

$loginDlsa = Invoke-Login -Email "dlsa@rihai.gov.in" -Password "Passw0rd!23"
$hdrDlsa = @{ Authorization = "Bearer $($loginDlsa.Body.accessToken)" }
$escDlsa = Invoke-Api -Method Post -Url "$ApiBase/api/v1/applications/$escalateTarget/escalate" -Headers $hdrDlsa
Test-Result "DLSA lawyer cannot escalate (403)" ($escDlsa.Status -eq 403) ("status=" + $escDlsa.Status)

$stallOther = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$jailId/stall-list" -Headers $hdrDlsa
Test-Result "Lawyer with JailAccess reads stall list" ($stallOther.Status -eq 200) ("status=" + $stallOther.Status)

# ---------- logout ----------
$logout = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/logout" -Session $loginSuper.Session
Test-Result "Logout responds 204" ($logout.Status -eq 204 -or $logout.Status -eq 200) ("status=" + $logout.Status)

# ---------- rate limiting (last: consumes the window) ----------
$limitedHit = $false
for ($i = 0; $i -lt 8; $i++) {
    $r = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/login" -Body @{ email = "ratelimit.probe@rihai.gov.in"; password = "nope-$i" }
    if ($r.Status -eq 429) { $limitedHit = $true; break }
}
Test-Result "Login rate-limited after 5 attempts/min/IP (429)" $limitedHit ""

# ---------- summary ----------
Write-Output ""
Write-Output ("RESULT: {0} passed, {1} failed" -f $script:passCount, $script:failCount)
if ($script:failCount -gt 0) {
    Write-Output "Failures:"
    foreach ($f in $script:failures) { Write-Output ("  " + $f) }
    exit 1
}
exit 0
