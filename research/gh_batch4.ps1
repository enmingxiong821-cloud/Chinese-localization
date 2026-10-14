$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Continue'

$queries = @(
    'XUnity.AutoTranslator',
    'generic+localization+patcher',
    'electron+translation+injector',
    '%E6%B1%89%E5%8C%96+%E5%B7%A5%E5%85%B7+%E9%80%9A%E7%94%A8',
    '%E7%BF%BB%E8%AF%91+%E6%9C%AF%E8%AF%AD%E8%A1%A8',
    'rapidocr',
    'oneocr',
    'paddleocr+onnx',
    'whisper+realtime+subtitle',
    'live+caption+translation+desktop',
    'translation+plugin+framework+ocr',
    'i18n+coverage+checker+json+locale',
    'electron+preload+inject+dom+translate',
    'dom+translate+mutationobserver+extension',
    'hunyuan+mt',
    'qwen+mt+translate',
    'sentence+level+translation+cache+sqlite'
)

foreach ($q in $queries) {
    $decoded = [System.Uri]::UnescapeDataString($q)
    try {
        $json = gh api "search/repositories?q=$q&sort=stars&order=desc&per_page=6" 2>&1 | Out-String
        $obj = $json | ConvertFrom-Json
        Write-Output "===== $decoded   total=$($obj.total_count)"
        foreach ($item in $obj.items) {
            $desc = $item.description
            if ($null -eq $desc) { $desc = '' }
            $desc = ($desc -replace '\r?\n', ' ')
            if ($desc.Length -gt 110) { $desc = $desc.Substring(0, 110) }
            Write-Output ("  {0,7}  {1}  [{2}]  {3}" -f $item.stargazers_count, $item.full_name, $item.language, $desc)
        }
    }
    catch {
        Write-Output "===== $decoded   FAILED: $($_.Exception.Message)"
    }
    Start-Sleep -Milliseconds 900
}

# one extra README we still need
$out = Join-Path $PSScriptRoot 'readmes'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$text = gh api "repos/vibepm666/cursor-localization-zh/readme" -H "Accept: application/vnd.github.raw" 2>&1 | Out-String
Set-Content -LiteralPath (Join-Path $out 'vibepm666__cursor-localization-zh.md') -Value $text -Encoding UTF8
Write-Output ("README vibepm666/cursor-localization-zh: " + $text.Length + " chars")
