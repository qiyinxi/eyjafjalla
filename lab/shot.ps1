# 调试页截图（开发用）：用无头 Chrome 打开 lab/<Page>，经 DevTools 协议等到 document.title 为 DONE（或 ERR…）再截图。
# 大图集（几千像素的 atlas）解码要好几秒，旧版靠 --virtual-time-budget 会在载入完成前就截出空白图。
# 用法：pwsh lab/shot.ps1 -Page puppet.html -Query "key=alter-e0&frames=rest,tilt@1.1" -Out C:\path\shot.png [-Width 1600 -Height 900 -Budget 60000]
param(
  [string]$Page = "puppet.html",
  [string]$Query = "key=alter-e0",
  [string]$Out = "$env:TEMP\doll-shot.png",
  [int]$Width = 1600,
  [int]$Height = 900,
  [string]$Base = "http://localhost:5173",
  [int]$Budget = 180000 # 最长等待（毫秒）
)
$ErrorActionPreference = 'Stop'
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "no Chrome / Edge found" }
if (Test-Path $Out) { Remove-Item $Out -Force }
$port = Get-Random -Minimum 20000 -Maximum 60000
# 每次用独立的临时配置目录，避免多个并发截图互相锁住
$prof = Join-Path $env:TEMP ("doll-cdp-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$sep = if ($Query) { "?" } else { "" }
$url = "$Base/lab/$Page$sep$Query&w=$Width&h=$Height"
$args = @("--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--user-data-dir=$prof",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--window-size=$Width,$Height", "--remote-debugging-port=$port", "about:blank")
$p = Start-Process -FilePath $chrome -ArgumentList $args -PassThru -WindowStyle Hidden
try {
  $ws = $null
  for ($i = 0; $i -lt 300; $i++) {
    try {
      $list = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 2
      $pg = $list | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
      if ($pg) { $ws = $pg.webSocketDebuggerUrl; break }
    } catch { }
    Start-Sleep -Milliseconds 200
  }
  if (-not $ws) { throw "no devtools page" }
  $sock = [System.Net.WebSockets.ClientWebSocket]::new()
  $sock.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(30)
  $sock.ConnectAsync([Uri]$ws, [Threading.CancellationToken]::None).Wait()
  $script:id = 0
  function Send-Cdp($method, $params) {
    $script:id++
    $msg = @{ id = $script:id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    # 每次收发最多等 30 秒：Chrome 卡住或提前退出时，ReceiveAsync 没有超时会一直挂着
    $cts = [Threading.CancellationTokenSource]::new(30000)
    $sock.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
    $want = $script:id
    while ($true) {
      $ms = [IO.MemoryStream]::new()
      $buf = [byte[]]::new(1048576)
      do {
        $r = $sock.ReceiveAsync([ArraySegment[byte]]::new($buf), $cts.Token).Result
        $ms.Write($buf, 0, $r.Count)
      } while (-not $r.EndOfMessage)
      $obj = [Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json -Depth 20
      if ($obj.id -eq $want) { return $obj }
    }
  }
  Send-Cdp 'Emulation.setDeviceMetricsOverride' @{ width = $Width; height = $Height; deviceScaleFactor = 1; mobile = $false } | Out-Null
  Send-Cdp 'Page.navigate' @{ url = $url } | Out-Null
  $t0 = Get-Date
  $title = ''
  while (((Get-Date) - $t0).TotalMilliseconds -lt $Budget) {
    Start-Sleep -Milliseconds 400
    $r = Send-Cdp 'Runtime.evaluate' @{ expression = 'document.title'; returnByValue = $true }
    $title = $r.result.result.value
    if ($title -eq 'DONE' -or ($title -like 'ERR*')) { break }
  }
  Start-Sleep -Milliseconds 300
  $shot = Send-Cdp 'Page.captureScreenshot' @{ format = 'png'; captureBeyondViewport = $false }
  [IO.File]::WriteAllBytes($Out, [Convert]::FromBase64String($shot.result.data))
  Write-Output "saved $Out ($title, $([int]((Get-Date) - $t0).TotalSeconds)s)"
  try { Send-Cdp 'Browser.close' @{} | Out-Null } catch { }
} finally {
  Start-Sleep -Milliseconds 300
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 300
  Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
}
