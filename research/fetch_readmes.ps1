param(
    [int]$MaxChars = 20000
)

$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Continue'

$repos = @(
    'javaht/claude-desktop-zh-cn',
    'hlmd/postman-chinese-injector',
    'qqxpee/antigravity2-cn',
    'Edwardxlai/easyread',
    'polang233/cursor-language-pack',
    'Jyy1529/claude-desktop_win-zh_cn',
    'good9527/Claude-Desktop-Chinese',
    'OneMoreGres/ScreenTranslator',
    'Hon-Lu/OverTranslate',
    'hanmin0822/MisakaTranslator',
    'microsoft/vscode-loc',
    'liuqiaokun/awesome-screen-translation',
    'pot-app/pot-desktop',
    'xushengfeng/eSearch'
)

$out = Join-Path $PSScriptRoot 'readmes'
New-Item -ItemType Directory -Force -Path $out | Out-Null

foreach ($repo in $repos) {
    $safe = $repo -replace '/', '__'
    $file = Join-Path $out "$safe.md"
    try {
        $resp = Invoke-WebRequest -Uri "https://api.github.com/repos/$repo/readme" -TimeoutSec 30 `
            -Headers @{ 'User-Agent' = 'codex-research'; 'Accept' = 'application/vnd.github.raw' }
        $text = $resp.Content
        if ($text.Length -gt $MaxChars) { $text = $text.Substring(0, $MaxChars) + "`n`n<!-- truncated -->`n" }
        Set-Content -LiteralPath $file -Value $text -Encoding UTF8
        Write-Output ("OK   {0,-45} {1,7} chars -> {2}" -f $repo, $resp.Content.Length, $safe)
    }
    catch {
        Write-Output ("FAIL {0,-45} {1}" -f $repo, $_.Exception.Message)
    }
    Start-Sleep -Milliseconds 800
}
