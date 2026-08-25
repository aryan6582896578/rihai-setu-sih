param(
    [string]$ApiBase = "http://localhost:4000"
)

# RIHAI SETU smoke test v3 -- Session 8: ingestion pipeline + PII security.

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

# TOTP (RFC 6238) computed natively so the MFA flow is exercised end-to-end.
function Get-TotpCode {
    param([string]$SecretB32)
    $alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    $clean = $SecretB32.ToUpper().Replace("=", "").Replace(" ", "")
    $bytes = New-Object System.Collections.Generic.List[byte]
    $bits = 0; $value = 0
    foreach ($ch in $clean.ToCharArray()) {
        $idx = $alphabet.IndexOf($ch)
        if ($idx -lt 0) { throw "bad base32" }
        $value = (($value -shl 5) -bor $idx) -band 0xFFFFFFFF
        $bits += 5
        if ($bits -ge 8) {
            $bytes.Add([byte](($value -shr ($bits - 8)) -band 0xFF))
            $bits -= 8
        }
    }
    $key = $bytes.ToArray()
    $counter = [math]::Floor(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) / 30000)
    $ctrBytes = [BitConverter]::GetBytes([UInt64]$counter)
    if ([BitConverter]::IsLittleEndian) { [array]::Reverse($ctrBytes) }
    $hmac = New-Object System.Security.Cryptography.HMACSHA1 -ArgumentList (,$key)
    $hash = $hmac.ComputeHash($ctrBytes)
    $offset = $hash[$hash.Length - 1] -band 0x0F
    $code = ((($hash[$offset] -band 0x7F) -shl 24) -bor (($hash[$offset + 1] -band 0xFF) -shl 16) -bor (($hash[$offset + 2] -band 0xFF) -shl 8) -bor ($hash[$offset + 3] -band 0xFF))
    return ([string]($code % 1000000)).PadLeft(6, "0")
}

Write-Output "=== RIHAI SETU smoke test v3 -- prompt 8: ingestion + PII security ==="

$loginSuper = Invoke-Login -Email "superintendent1@rihai.gov.in" -Password "Passw0rd!23"
$superHdr = @{ Authorization = "Bearer $($loginSuper.Body.accessToken)" }
Test-Result "Superintendent login" ($loginSuper.Status -eq 200) ("status=" + $loginSuper.Status)

$jails = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails?pageSize=10" -Headers $superHdr
$rampurId = $jails.Data.data[0].id

# ---------- RBAC guard ----------
$staffLogin = Invoke-Login -Email "staff1a@rihai.gov.in" -Password "Passw0rd!23"
$staffHdr = @{ Authorization = "Bearer $($staffLogin.Body.accessToken)" }
$staffBlocked = Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/audit-log" -Headers $staffHdr
Test-Result "jail_staff blocked from audit log (403)" ($staffBlocked.Status -eq 403) ("status=" + $staffBlocked.Status)

# ---------- upload batch A ----------
$listBefore = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners?pageSize=1" -Headers $superHdr
$countBefore = [long]$listBefore.Data.total

# Per-run prefix keeps the smoke test idempotent across repeated runs.
$runTag = -join ((97..122) | Get-Random -Count 8 | ForEach-Object { [char]$_ })
$csvPath = Join-Path $env:TEMP "sample-ingestion-$runTag.csv"
(Get-Content (Join-Path $PSScriptRoot "sample-ingestion.csv") -Raw) -replace "ING-R", "R$runTag-R" -replace "CNR-ING-", "CNR-$runTag-" | Set-Content -Path $csvPath -Encoding ASCII
$uploadA = curl.exe -s -X POST "$ApiBase/api/v1/admin/ingestion/upload" -H "Authorization: Bearer $($loginSuper.Body.accessToken)" -F "file=@$csvPath" -F "jailId=$rampurId"
$batchA = ($uploadA -join "`n") | ConvertFrom-Json
$batchA = $batchA.data
Test-Result "CSV upload validates & stages batch" (
    $batchA -and $batchA.status -eq "staged" -and $batchA.rowCount -eq 5 -and $batchA.errorCount -eq 1
) ("status=" + $batchA.status + " rows=" + $batchA.rowCount + " err=" + $batchA.errorCount)

$countAfterUpload = [long]((Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners?pageSize=1" -Headers $superHdr).Data.total)
Test-Result "Nothing auto-merged on upload (count unchanged)" ($countAfterUpload -eq $countBefore) ("before=$countBefore after=$countAfterUpload")

$fetchedBatch = (Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/ingestion/$($batchA.id)" -Headers $superHdr).Data.data
$rowByNo = @{}
foreach ($r in $fetchedBatch.rows) { $rowByNo[[int]$r.rowNo] = $r }
Test-Result "Bad row flagged as validation error" ($rowByNo[3].validationStatus -eq "error" -and $rowByNo[3].validationErrors.Count -gt 0) ("st=" + $rowByNo[3].validationStatus)

# ---------- resolve: merge clean rows, reject the error row ----------
$m1 = Invoke-Api -Method Post -Url "$ApiBase/api/v1/admin/ingestion/$($batchA.id)/rows/$($rowByNo[1].id)/resolve" -Headers $superHdr -Body @{ action = "merge" }
Test-Result "Clean row merges into canonical tables" ($m1.Status -eq 200 -and $m1.Data.data.status -in @("reconciling")) ("status=" + $m1.Data.data.status)

$m2 = Invoke-Api -Method Post -Url "$ApiBase/api/v1/admin/ingestion/$($batchA.id)/rows/$($rowByNo[2].id)/resolve" -Headers $superHdr -Body @{ action = "merge" }
$m5 = Invoke-Api -Method Post -Url "$ApiBase/api/v1/admin/ingestion/$($batchA.id)/rows/$($rowByNo[5].id)/resolve" -Headers $superHdr -Body @{ action = "merge" }
$m3 = Invoke-Api -Method Post -Url "$ApiBase/api/v1/admin/ingestion/$($batchA.id)/rows/$($rowByNo[3].id)/resolve" -Headers $superHdr -Body @{ action = "reject" }
# Row 4 deliberately left UNRESOLVED: batch must sit in 'reconciling' until a human acts.
Test-Result "Error row rejected; batch stays reconciling w/ provenance counts" (
    $m3.Status -eq 200 -and $m3.Data.data.status -eq "reconciling" -and $m3.Data.data.mergedCount -eq 3 -and $m3.Data.data.rejectedCount -eq 1
) ("status=" + $m3.Data.data.status + " merged=" + $m3.Data.data.mergedCount + " rejected=" + $m3.Data.data.rejectedCount)

$countAfterMerge = [long]((Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners?pageSize=1" -Headers $superHdr).Data.total)
Test-Result "Exactly the reviewed rows merged (+3)" ($countAfterMerge -eq ($countBefore + 3)) ("delta=" + ($countAfterMerge - $countBefore))

$searchRamesh = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners?search=R$runTag-R001" -Headers $superHdr
Test-Result "Merged prisoner searchable by reg no" ($searchRamesh.Data.total -ge 1) ""

# ---------- batch B: same CSV again -> every row conflicts, nothing auto-merges ----------
Start-Sleep -Seconds 1
$uploadB = curl.exe -s -X POST "$ApiBase/api/v1/admin/ingestion/upload" -H "Authorization: Bearer $($loginSuper.Body.accessToken)" -F "file=@$csvPath" -F "jailId=$rampurId"
$batchB = ((($uploadB -join "`n") | ConvertFrom-Json)).data

$fetchedB = (Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/ingestion/$($batchB.id)" -Headers $superHdr).Data.data
$bRows = @{}
foreach ($r in $fetchedB.rows) { $bRows[[int]$r.rowNo] = $r }
Test-Result "Re-upload flags exact dup on reg no" ($bRows[1].conflictType -eq "exact_dup" -and $bRows[1].validationStatus -eq "warning") ("ct=" + $bRows[1].conflictType)
Test-Result "Re-upload fuzzy-dup catches name+DOB+admission match" ($bRows[4].conflictType -eq "fuzzy_dup") ("ct=" + $bRows[4].conflictType)
Test-Result "Conflict rows are NOT merged automatically" ($batchB.status -eq "staged" -and [long]((Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners?pageSize=1" -Headers $superHdr).Data.total) -eq $countAfterMerge) ""

$attach = Invoke-Api -Method Post -Url "$ApiBase/api/v1/admin/ingestion/$($batchB.id)/rows/$($bRows[4].id)/resolve" -Headers $superHdr -Body @{ action = "attach_case" }
Test-Result "attach_case adds case to existing record without overwrite" (
    $attach.Status -eq 200 -and $attach.Data.data.status -in @("reconciling")
) ("status=" + $attach.Data.data.status)

# Follow the row's own conflictWith link -- earlier smoke runs may have left
# several canonical records with the same normalized name, so match what the
# system actually matched rather than assuming this run's reg no.
$fetchedB2 = (Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/ingestion/$($batchB.id)" -Headers $superHdr).Data.data
$attachedRow = @($fetchedB2.rows | Where-Object { $_.rowNo -eq 4 })[0]
$targetReg = $null
if ($attachedRow.conflictWith) { $targetReg = $attachedRow.conflictWith.prisonerRegNo }
if ($targetReg) {
    $detailTarget = Invoke-Api -Method Get -Url "$ApiBase/api/v1/jails/$rampurId/prisoners?search=$targetReg&pageSize=5" -Headers $superHdr
    $pidTarget = $detailTarget.Data.data[0].id
    if ($pidTarget) {
        $det = (Invoke-Api -Method Get -Url "$ApiBase/api/v1/prisoners/$pidTarget" -Headers $superHdr).Data.data
        Test-Result "Attached case visible on canonical record (2 cases)" ($det.cases.Count -ge 2) ("cases=" + $det.cases.Count)
    } else {
        Test-Result "Attached case visible on canonical record (2 cases)" $false "target not found"
    }
} else {
    Test-Result "Attached case visible on canonical record (2 cases)" $false "no conflictWith"
}

# ---------- audit log ----------
$auditQ = Invoke-Api -Method Get -Url "$ApiBase/api/v1/admin/audit-log?action=prisoner.read&pageSize=10" -Headers $superHdr
$firstEntry = $auditQ.Data.data | Select-Object -First 1
Test-Result "Audit trail captures Tier-1 reads w/ actor + timestamp" (
    $auditQ.Data.total -ge 1 -and $firstEntry.actorName -and $firstEntry.at
) ("total=" + $auditQ.Data.total)

# ---------- encryption at rest (raw dump) ----------
$encCheck = npx tsx apps/api/scripts/check-encryption.ts 2>&1
Test-Result "Raw DB dump shows ciphertext only (Tier-1 unreadable)" ($LASTEXITCODE -eq 0 -and "$encCheck" -match "PASS") ("exit=" + $LASTEXITCODE)

# ---------- MFA enrollment -> login enforcement ----------
$enroll = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/mfa/enroll" -Headers $superHdr
$secret = $enroll.Data.data.secret
Test-Result "MFA enroll returns secret" ($enroll.Status -eq 200 -and $secret.Length -ge 32) ""

$code1 = Get-TotpCode -SecretB32 $secret
$confirm = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/mfa/confirm" -Headers $superHdr -Body @{ code = $code1 }
Test-Result "TOTP confirm enables MFA" ($confirm.Status -eq 200 -and $confirm.Data.data.mfaEnabled) ""

$challenge = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/login" -Body @{ email = "superintendent1@rihai.gov.in"; password = "Passw0rd!23" }
Test-Result "Password alone no longer completes login (MFA required)" (
    $challenge.Status -eq 200 -and $challenge.Data.mfaRequired -eq $true -and $challenge.Data.challengeToken
) ("mfaRequired=" + $challenge.Data.mfaRequired)

$badCode = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/mfa/verify" -Body @{ challengeToken = $challenge.Data.challengeToken; code = "000000" }
Test-Result "Wrong authenticator code rejected" ($badCode.Status -eq 401) ("status=" + $badCode.Status)

$goodCode = Get-TotpCode -SecretB32 $secret
$verify = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/mfa/verify" -Body @{ challengeToken = $challenge.Data.challengeToken; code = $goodCode }
Test-Result "Correct code issues tokens (login completes)" ($verify.Status -eq 200 -and $verify.Data.accessToken) ""

$revAll = Invoke-Api -Method Post -Url "$ApiBase/api/v1/auth/sessions/revoke-all" -Headers $superHdr
Test-Result "Revoke-all-sessions reports revoked count" ($revAll.Status -eq 200 -and $revAll.Data.data.revoked -ge 1) ("revoked=" + $revAll.Data.data.revoked)

npx tsx apps/api/scripts/reset-mfa.ts superintendent1@rihai.gov.in 2>&1 | Out-Null
Write-Output "      (post-test: MFA cleared for superintendent1 so other suites keep passing)"

Write-Output ""
Write-Output ("RESULT: {0} passed, {1} failed" -f $script:passCount, $script:failCount)
if ($script:failCount -gt 0) {
    foreach ($f in $script:failures) { Write-Output ("  " + $f) }
    exit 1
}
exit 0
