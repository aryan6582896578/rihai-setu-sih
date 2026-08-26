param(
    [string]$ApiBase = "http://localhost:4000"
)

# RIHAI SETU smoke test v4 -- Prompt 10: prisoner portal auth.
# Covers: temp-PIN issue -> forced change, PIN login, 5-strike lockout,
# staff reset (unlocks), kiosk biometric mock, next-of-kin OTP reset,
# documents boundary, cross-actor token rejection, audit trail.

$script:passCount = 0
$script:failCount = 0
$script:failures = New-Object System.Collections.Generic.List[string]

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
    param([string]$Method, [string]$Url, $Body, [hashtable]$Headers)
    try {
        $params = @{ Method = $Method; Uri = $Url; ErrorAction = "Stop"; TimeoutSec = 25 }
        if ($Body -ne $null) {
            $params.Body = ($Body | ConvertTo-Json -Depth 6)
            $params.ContentType = "application/json"
        }
        if ($Headers) { $params.Headers = $Headers }
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
    param([string]$Email, [string]$Password)
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        try {
            $raw = Invoke-WebRequest -Uri "$($script:ApiBase)/api/v1/auth/login" `
                -Method Post -ContentType "application/json" `
                -Body (@{ email = $Email; password = $Password } | ConvertTo-Json) `
                -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
            return @{ Status = 200; Body = ($raw.Content | ConvertFrom-Json) }
        } catch {
            $code = -1
            try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = 0 }
            if ($code -eq 429 -and $attempt -eq 0) {
                Write-Output "      (rate-limited by design -- waiting 65s)"
                Start-Sleep -Seconds 65
                continue
            }
            return @{ Status = $code; Body = $null }
        }
    }
    return @{ Status = -1; Body = $null }
}

Write-Output "=== RIHAI SETU smoke test v4 -- prompt 10: prisoner portal auth ==="

$loginSuper = Invoke-Login -Email "superintendent1@rihai.gov.in" -Password "Passw0rd!23"
$superHdr = @{ Authorization = "Bearer $($loginSuper.Body.accessToken)" }
Test-Result "Staff login" ($loginSuper.Status -eq 200) ("status=" + $loginSuper.Status)

$jails = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails?pageSize=5" -Headers $superHdr
$jailId = $jails.Data.data[0].id

$plist = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$jailId/prisoners?page=1&pageSize=1" -Headers $superHdr
$prisonerId = $plist.Data.data[0].id
$regNo = $plist.Data.data[0].prisonerRegNo
Test-Result "Picked seeded prisoner" ($prisonerId -and $regNo) ("reg=" + $regNo)

$portalAuth = "$ApiBase/api/v1/portal/auth"
$newPin = "2468"

# ---------- staff-assisted reset path ----------
$temp1 = Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$prisonerId/portal/temp-pin" -Headers $superHdr
$tempPin1 = $temp1.Data.data.temporaryPin
Test-Result "Staff issues one-time temp PIN (shown once)" ($temp1.Status -eq 200 -and $tempPin1 -match '^\d{6}$') ("pin=" + $tempPin1)

# ---------- PIN login + lockout after 5 failures ----------
$wrong1 = Invoke-Api -Method Post -Url "$portalAuth/login-pin" -Body @{ prisonerRegNo = $regNo; pin = "0000" }
Test-Result "Wrong PIN rejected with attempts remaining" (
    $wrong1.Status -eq 401 -and $wrong1.Error -match "4 attempt"
) ("status=$($wrong1.Status) body=$($wrong1.Error)")

for ($i = 0; $i -lt 3; $i++) {
    Invoke-Api -Method Post -Url "$portalAuth/login-pin" -Body @{ prisonerRegNo = $regNo; pin = "0000" } | Out-Null
}
$fifth = Invoke-Api -Method Post -Url "$portalAuth/login-pin" -Body @{ prisonerRegNo = $regNo; pin = "0000" }
$sixth = Invoke-Api -Method Post -Url "$portalAuth/login-pin" -Body @{ prisonerRegNo = $regNo; pin = $tempPin1 }
Test-Result "Account locks at the 5th failed attempt" ($fifth.Status -eq 403 -and $fifth.Error -match "locked") ("status=" + $fifth.Status)
Test-Result "Even the CORRECT PIN is refused while locked" ($sixth.Status -eq 403 -and $sixth.Error -match "ACCOUNT_LOCKED|locked") ("status=" + $sixth.Status)

# ---------- staff reset unlocks; temp PIN forces change on next login ----------
$temp2 = Invoke-Api -Method Post -Url "$ApiBase/api/v1/prisoners/$prisonerId/portal/temp-pin" -Headers $superHdr
$tempPin2 = $temp2.Data.data.temporaryPin
Test-Result "Second staff temp PIN clears the lock" ($temp2.Status -eq 200 -and $tempPin2) ""

$loginTemp = Invoke-Api -Method Post -Url "$portalAuth/login-pin" -Body @{ prisonerRegNo = $regNo; pin = $tempPin2 }
$scopedToken = $loginTemp.Data.accessToken
Test-Result "Temp PIN logs in but demands a change" (
    $loginTemp.Status -eq 200 -and $loginTemp.Data.pinChangeRequired -eq $true -and $scopedToken
) ("status=$($loginTemp.Status) mustChange=$($loginTemp.Data.pinChangeRequired)")

$blockedRead = Invoke-Api -Method Get -Url "$ApiBase/api/v1/portal/profile" -Headers @{ Authorization = "Bearer $scopedToken" }
Test-Result "Scoped session cannot read profile before changing PIN" ($blockedRead.Status -eq 403) ("status=" + $blockedRead.Status)

$changed = Invoke-Api -Method Post -Url "$portalAuth/set-pin" -Headers @{ Authorization = "Bearer $scopedToken" } -Body @{ newPin = $newPin }
$fullToken = $changed.Data.data.accessToken
Test-Result "Prisoner sets own PIN and gets full session" ($changed.Status -eq 200 -and $fullToken) ("status=" + $changed.Status)

$wrongOld = Invoke-Api -Method Post -Url "$portalAuth/login-pin" -Body @{ prisonerRegNo = $regNo; pin = $tempPin2 }
Test-Result "Old temp PIN no longer works" ($wrongOld.Status -eq 401) ("status=" + $wrongOld.Status)

$relogin = Invoke-Api -Method Post -Url "$portalAuth/login-pin" -Body @{ prisonerRegNo = $regNo; pin = $newPin }
Test-Result "New own PIN logs straight in (no forced change)" (
    $relogin.Status -eq 200 -and $relogin.Data.pinChangeRequired -eq $false
) ("status=" + $relogin.Status)
$prisToken = if ($fullToken) { $fullToken } else { $relogin.Data.accessToken }

# ---------- read-only self-service, scoped to own record ----------
$profile = Invoke-Api -Method Get -Url "$ApiBase/api/v1/portal/profile" -Headers @{ Authorization = "Bearer $prisToken" }
Test-Result "Profile shows ONLY the caller's own record" (
    $profile.Status -eq 200 -and $profile.Data.data.prisonerRegNo -eq $regNo -and $profile.Data.data.eligibility.plainReason
) ("status=$($profile.Status) reg=$($profile.Data.data.prisonerRegNo)")
Test-Result "Eligibility reason translated to plain language" ($profile.Data.data.eligibility.headline.Length -gt 0) ""

$staffOnPortal = Invoke-Api -Method Get -Url "$ApiBase/api/v1/portal/profile" -Headers $superHdr
Test-Result "Staff JWT rejected on portal route (separate domains)" ($staffOnPortal.Status -eq 401) ("status=" + $staffOnPortal.Status)
$prisOnStaff = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails" -Headers @{ Authorization = "Bearer $prisToken" }
Test-Result "Prisoner JWT rejected on staff route" ($prisOnStaff.Status -in @(401)) ("status=" + $prisOnStaff.Status)

# ---------- documents boundary ----------
$detail = Invoke-Api -Method Get -Url "$ApiBase/api/v1/prisoners/$prisonerId" -Headers $superHdr
$visibleExpected = @()
foreach ($a in $detail.Data.data.applications) {
    if ($a.generatedDocumentUrl -and $a.reviewedByName -and $a.stage -in @("filed", "hearing_scheduled", "order_passed", "released")) {
        $visibleExpected += $a.id
    }
}
$docs = Invoke-Api -Method Get -Url "$ApiBase/api/v1/portal/documents" -Headers @{ Authorization = "Bearer $prisToken" }
$appDocs = @($docs.Data.data | Where-Object { $_.kind -eq "application_document" })
$certDocs = @($docs.Data.data | Where-Object { $_.kind -eq "skill_certificate" })
$idsShown = @($appDocs | ForEach-Object { $_.id })
$boundaryOk = $true
foreach ($id in $idsShown) { if ($visibleExpected -notcontains $id) { $boundaryOk = $false } }
Test-Result "Documents show only filed+reviewed apps (never drafts)" ($docs.Status -eq 200 -and $boundaryOk) (
    "shown=" + $idsShown.Count + " expected=" + $visibleExpected.Count)
Test-Result "Skill Passport certificates listed from completed enrollments" (
    $certDocs.Count -eq @($detail.Data.data.enrollments | Where-Object { $_.status -eq "completed" -and $_.certificateUrl }).Count
) ("certs=" + $certDocs.Count)

# ---------- kiosk biometric (mock provider behind UIDAI seam) ----------
$bio = Invoke-Api -Method Post -Url "$portalAuth/login-kiosk-biometric" -Body @{ prisonerRegNo = $regNo }
Test-Result "Kiosk fingerprint mock logs in without hardware" (
    $bio.Status -eq 200 -and $bio.Data.accessToken -and $bio.Data.prisoner.prisonerRegNo -eq $regNo
) ("status=" + $bio.Status)
$bioGhost = Invoke-Api -Method Post -Url "$portalAuth/login-kiosk-biometric" -Body @{ prisonerRegNo = "NO-SUCH-REG-123" }
Test-Result "Unknown reg no cannot pass the kiosk mock" ($bioGhost.Status -eq 401) ("status=" + $bioGhost.Status)

# ---------- next-of-kin OTP reset (post-release path) ----------
$runTag = -join ((97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
$nokPatch = Invoke-Api -Method Patch -Url "$ApiBase/api/v1/prisoners/$prisonerId" -Headers $superHdr `
    -Body @{ nextOfKinName = "Smoke Kin $runTag"; nextOfKinPhone = "+91-9876500000" }
Test-Result "Staff records next-of-kin contact (OTP target)" ($nokPatch.Status -eq 200) ("status=" + $nokPatch.Status)

$otpReq = Invoke-Api -Method Post -Url "$portalAuth/reset-pin/request-otp" -Body @{ prisonerRegNo = $regNo }
$devOtp = $otpReq.Data.devOtp
Test-Result "Reset OTP dispatched to next-of-kin contact" (
    $otpReq.Status -eq 200 -and $otpReq.Data.ok -eq $true -and $devOtp -match '^\d{6}$'
) ("sentTo=" + $otpReq.Data.sentTo)

$badConfirm = Invoke-Api -Method Post -Url "$portalAuth/reset-pin/confirm" -Body @{ prisonerRegNo = $regNo; otp = "000000"; newPin = "1357" }
Test-Result "Wrong OTP refuses to reset" ($badConfirm.Status -eq 400) ("status=" + $badConfirm.Status)

$goodConfirm = Invoke-Api -Method Post -Url "$portalAuth/reset-pin/confirm" -Body @{ prisonerRegNo = $regNo; otp = $devOtp; newPin = "1357" }
Test-Result "Correct OTP resets the PIN" ($goodConfirm.Status -eq 200) ("status=" + $goodConfirm.Status)

$postReset = Invoke-Api -Method Post -Url "$portalAuth/login-pin" -Body @{ prisonerRegNo = $regNo; pin = "1357" }
Test-Result "Login works with the OTP-reset PIN (identity carries over)" (
    $postReset.Status -eq 200 -and $postReset.Data.pinChangeRequired -eq $false
) ("status=" + $postReset.Status)

# ---------- first-time setup guard: cannot hijack an existing account via set-pin ----------
$hijack = Invoke-Api -Method Post -Url "$portalAuth/set-pin" -Body @{ prisonerRegNo = $regNo; newPin = "9999" }
Test-Result "Unauthenticated set-pin refused for accounts that already have a PIN" ($hijack.Status -in @(403)) ("status=" + $hijack.Status)

# ---------- audit trail ----------
$auditQ = Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/audit-log?action=portal.login&pageSize=20" -Headers $superHdr
$prisEntries = @($auditQ.Data.data | Where-Object { $_.actorType -eq "prisoner" })
Test-Result "AuditLog records prisoner logins w/ actor_type=prisoner" (
    $auditQ.Status -eq 200 -and $prisEntries.Count -ge 1
) ("entries=" + $prisEntries.Count)

$docAudit = Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/audit-log?action=portal.documents_read&pageSize=5" -Headers $superHdr
Test-Result "Document access audited too" ($docAudit.Data.total -ge 1) ("total=" + $docAudit.Data.total)

Write-Output ""
Write-Output ("RESULT: {0} passed, {1} failed" -f $script:passCount, $script:failCount)
if ($script:failCount -gt 0) {
    foreach ($f in $script:failures) { Write-Output ("  " + $f) }
    exit 1
}
exit 0
