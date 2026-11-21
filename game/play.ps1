[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$offline = Join-Path $PSScriptRoot 'dist\牛逼外卖-第一天.html'
if (Test-Path -LiteralPath $offline -PathType Leaf) {
    Start-Process -FilePath $offline
    return
}
$site = 'http://127.0.0.1:5188/'
$index = Join-Path $PSScriptRoot 'dist\index.html'
if (!(Test-Path -LiteralPath $index -PathType Leaf)) {
    throw 'Run npm.cmd install and npm.cmd run build in rider-demo first.'
}
$existing = $null
try {
    $existing = Invoke-WebRequest -Uri $site -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
} catch {}
if ($existing -and $existing.Content.Contains('id="city"')) {
    Start-Process $site
    return
}
if ($existing) { throw 'Port 5188 is running a different application.' }
$python = (Get-Command python -ErrorAction Stop).Source
$server = Start-Process -FilePath $python -ArgumentList @('-m','http.server','5188','--bind','127.0.0.1','--directory','dist') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
for ($attempt = 0; $attempt -lt 16; $attempt++) {
    Start-Sleep -Milliseconds 300
    if ($server.HasExited) { throw 'The local preview server could not start on port 5188.' }
    $reply = $null
    try {
        $reply = Invoke-WebRequest -Uri $site -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    } catch {}
    if ($reply -and $reply.Content.Contains('id="city"')) {
        Start-Process $site
        return
    }
}
throw 'Preview did not respond. Run python -m http.server 5188 --bind 127.0.0.1 --directory dist.'
