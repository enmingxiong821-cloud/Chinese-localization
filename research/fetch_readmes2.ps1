param(
    [int]$MaxChars = 24000
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
    'liuqiaokun/awesome-screen-translation',
    'pot-app/pot-desktop',
    'Yaozhu666/Codex-Chinese',
    'ramjke/Translumo',
    'HIllya51/LunaTranslator'
)

$out = Join-Path $PSScriptRoot 'readmes'
New-Item -ItemType Directory -Force -Path $out | Out-Null

foreach ($repo in $repos) {
    $safe = $repo -replace '/', '__'
    $file = Join-Path $out "$safe.md"
    try {
        $text = gh api "repos/$repo/readme" -H "Accept: application/vnd.github.raw" 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { throw ($text.Trim()) }
        $len = $text.Length
        if ($len -gt $MaxChars) { $text = $text.Substring(0, $MaxChars) + "`n`n<!-- truncated -->`n" }
        Set-Content -LiteralPath $file -Value $text -Encoding UTF8
        Write-Output ("OK   {0,-45} {1,7} chars" -f $repo, $len)
    }
    catch {
        Write-Output ("FAIL {0,-45} {1}" -f $repo, $_.Exception.Message)
    }
    Start-Sleep -Milliseconds 600
}
