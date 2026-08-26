param(
    [string]$ApiBase = "http://localhost:4000"
)

# RIHAI SETU -- Prompt 13 final probe: auth-contract matrix + spot checks.
# Demonstrates (a) 401 vs 403 handled differently across protected routes,
# (b) the exact refresh->retry contract the web interceptor performs,
# (c) actor-domain crossover rejection, (d) slow-path endpoints respond.

$script:passCount = 0
$script:failCount = 0

function Test-Result {
    param([string]$Name, [bool]$Condition, [string]$Detail = "")
    if ($Condition) {
        $script:passCount++
        Write-Output ("PASS  {0}" -f $Name)
    } else {
        $script:failCount++
        Write-Output ("FAIL  {0}  {1}" -f $Name, $Detail)
    }
}

function Invoke-Api {
    param([string]$Method, [string]$Url, $Body, [hashtable]$Headers, $WebSession)
    try {
        $params = @{ Method = $Method; Uri = $Url; ErrorAction = "Stop"; TimeoutSec = 30 }
        if ($Body -ne $null) {
            $params.Body = ($Body | ConvertTo-Json -Depth 6)
            $params.ContentType = "application/json"
        }
        if ($Headers) { $params.Headers = $Headers }
        if ($WebSession) { $params.WebSession = $WebSession }
        try {
            $resp = Invoke-WebRequest @params -UseBasicParsing
        } catch {
            if ($_.Exception.Response -eq $null) {
                Start-Sleep -Milliseconds 800
                $resp = Invoke-WebRequest @params -UseBasicParsing
            } else { throw }
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

function Invoke-Login {
    param([string]$Email, [string]$Password, [string]$SessionVar)
    try {
        $raw = Invoke-WebRequest -Uri "$($script:ApiBase)/api/v1/auth/login" `
            -Method Post -ContentType "application/json" `
            -Body (@{ email = $Email; password = $Password } | ConvertTo-Json) `
            -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop -SessionVariable $SessionVar
        return @{ Status = 200; Body = ($raw.Content | ConvertFrom-Json) }
    } catch {
        $code = -1
        try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = 0 }
        return @{ Status = $code; Body = $null }
    }
}

function Base64Url([byte[]]$Bytes) {
    [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

# Mint an EXPIRED staff access token with the local dev secret to prove the
# 401 -> refresh-cookie rotation -> retry contract end to end.
function New-ExpiredJwt([string]$Sub, [string]$Role, [string]$Secret) {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $header = Base64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
    $payloadJson = '{"sub":"' + $Sub + '","role":"' + $Role + '","iat":' + ($now - 7200) + ',"exp":' + ($now - 900) + '}'
    $payload = Base64Url ([Text.Encoding]::UTF8.GetBytes($payloadJson))
    $hmac = New-Object System.Security.Cryptography.HMACSHA256 -ArgumentList (,[Text.Encoding]::UTF8.GetBytes($Secret))
    $sig = Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$payload")))
    return "$header.$payload.$sig"
}

Write-Output "=== Prompt 13 final probe: auth contract + spot checks ==="

$envLine = (Get-Content (Join-Path $PSScriptRoot "..\.env") | Where-Object { $_ -match "^JWT_ACCESS_SECRET=" }) -replace "^JWT_ACCESS_SECRET=", ""
$jwtSecret = $envLine.Trim('"')

# ---------- unauthenticated = 401 everywhere ----------
$r1 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails"
Test-Result "No token on staff route -> 401 (never 403)" ($r1.Status -eq 401) ("status=" + $r1.Status)

$r2 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/portal/profile"
Test-Result "No token on portal route -> 401" ($r2.Status -eq 401) ("status=" + $r2.Status)

# ---------- wrong role / missing JailAccess = 403, distinct code ----------
$staff = Invoke-Login -Email "staff1a@rihai.gov.in" -Password "Passw0rd!23" -SessionVar svStaff
$staffHdr = @{ Authorization = "Bearer $($staff.Body.accessToken)" }

$r3 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/audit-log" -Headers $staffHdr
Test-Result "jail_staff on managers-only audit log -> 403 (stays on page)" ($r3.Status -eq 403) ("status=" + $r3.Status)

$r4 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/notification-templates" -Headers $staffHdr
Test-Result "jail_staff on template admin -> 403" ($r4.Status -eq 403) ("status=" + $r4.Status)

# Inline login (not the helper) so -SessionVariable lands at script scope and
# the refresh cookie survives for the contract demo further below.
$adminRaw = Invoke-WebRequest -Uri "$ApiBase/api/v1/auth/login" `
    -Method Post -ContentType "application/json" `
    -Body (@{ email = "superadmin@rihai.gov.in"; password = "Passw0rd!23" } | ConvertTo-Json) `
    -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop -SessionVariable adminSess
$admin = @{ Status = 200; Body = ($adminRaw.Content | ConvertFrom-Json) }
$adminHdr = @{ Authorization = "Bearer $($admin.Body.accessToken)" }

$jails = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails?pageSize=5" -Headers $staffHdr
$myJail = $jails.Data.data[0].id

# /jails is JailAccess-scoped: enumerate as super_admin, then prove a jail this
# staff member has NO access row for rejects with 403 (never 401).
$jailsAll = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails?pageSize=10" -Headers $adminHdr
$otherJail = $jailsAll.Data.data | Where-Object { $_.id -ne $myJail } | Select-Object -First 1
$r5 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$($otherJail.id)/stats" -Headers $staffHdr
Test-Result "Staff without JailAccess on another jail -> 403 JAIL_ACCESS_DENIED" (
    $r5.Status -eq 403 -and $r5.Error -match "JAIL_ACCESS_DENIED"
) ("status=$($r5.Status) body=$($r5.Error)")

# ---------- actor-domain crossover ----------
$prisList = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$myJail/prisoners?page=1&pageSize=1" -Headers $staffHdr
$regNo = $prisList.Data.data[0].prisonerRegNo
$tempPin = (Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$($prisList.Data.data[0].id)/portal/temp-pin" -Headers $staffHdr).Data.data.temporaryPin
Start-Sleep -Milliseconds 300
$prisLogin = Invoke-Api -Method Post -Url "$ApiBase/api/v1/portal/auth/login-pin" -Body @{ prisonerRegNo = $regNo; pin = $tempPin }
$prisToken = $prisLogin.Data.accessToken
if (-not $prisToken) {
    # pin-change required path: set then login again
    $scoped = Invoke-Api -Method Post -Url "$ApiBase/api/v1/portal/auth/set-pin" -Headers @{ Authorization = "Bearer $($prisLogin.Data.accessToken)" } -Body @{ newPin = "2468" }
    $prisToken = $scoped.Data.data.accessToken
}
Test-Result "Prisoner portal session obtained" ([bool]$prisToken) ""

$r6 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails" -Headers @{ Authorization = "Bearer $prisToken" }
Test-Result "Prisoner JWT on staff route -> 401 (actor_type rejected)" ($r6.Status -eq 401) ("status=" + $r6.Status)

$r7 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/portal/profile" -Headers $staffHdr
Test-Result "Staff JWT on portal route -> 401 (actor_type rejected)" ($r7.Status -eq 401) ("status=" + $r7.Status)

# ---------- refresh -> retry contract (what the web interceptor performs) ----------
$adminId = $admin.Body.user.id
$expired = New-ExpiredJwt -Sub $adminId -Role "super_admin" -Secret $jwtSecret

# Session-scoped cookie captured at script scope via -SessionVariable adminSess
# (function locals die with the function, so the admin login is inline above).
$r8 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/auth/me" -Headers @{ Authorization = "Bearer $expired" } -WebSession $adminSess
Test-Result "Expired access token -> 401 even with refresh cookie present" ($r8.Status -eq 401) ("status=" + $r8.Status)

$ref = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/refresh" -WebSession $adminSess
$newTok = $ref.Data.accessToken
Test-Result "Refresh cookie rotates silently -> new access token" ($ref.Status -eq 200 -and [bool]$newTok) ("status=" + $ref.Status)

$r9 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails?pageSize=1" -Headers @{ Authorization = "Bearer $newTok" }
Test-Result "Retried request with rotated token succeeds (200)" ($r9.Status -eq 200) ("status=" + $r9.Status)

# ---------- slow-path endpoints respond (Prompt 13 cause #4 spot checks) ----------
$r10 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$myJail/overcrowding/projection?days=30" -Headers $staffHdr
Test-Result "Overcrowding projection responds" ($r10.Status -eq 200) ("status=" + $r10.Status)

$r11 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$myJail/compliance-report?from=2026-01-01&to=2026-12-31" -Headers $staffHdr
Test-Result "Compliance report computes" ($r11.Status -eq 200) ("status=" + $r11.Status)

$r12 = curl.exe -s -o NUL -w "%{http_code}" -X GET "$ApiBase/api/v1/jails/$myJail/compliance-report/export?from=2026-01-01&to=2026-12-31&format=csv" -H "Authorization: Bearer $($staff.Body.accessToken)"
Test-Result "Compliance CSV export downloads (slow path ok)" ($r12 -eq "200") ("code=" + $r12)

$ngo = Invoke-Login -Email "ngo1@rihai.gov.in" -Password "Passw0rd!23" -SessionVar svNgo
$ngoHdr = @{ Authorization = "Bearer $($ngo.Body.accessToken)" }
$r13 = Invoke-Api -Method Get -Url "$ApiBase/api/v1/ngo/jobs" -Headers $ngoHdr
Test-Result "NGO jobs listing responds for ngo_partner" ($r13.Status -eq 200) ("status=" + $r13.Status)

Write-Output ""
Write-Output ("RESULT: {0} passed, {1} failed" -f $script:passCount, $script:failCount)
if ($script:failCount -gt 0) { exit 1 }
exit 0
