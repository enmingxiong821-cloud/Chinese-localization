$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Continue'

# Queries are pre URL-encoded so this file stays pure ASCII.
$queries = @(
    'dxgi+overlay+translation',
    'dll+injection+translate+game',
    'subtitle+translate+realtime+player',
    'cef+hook+translate',
    'asar+extract+repack+tool',
    'electron+i18n+extract+translate',
    'OCR+%E7%BF%BB%E8%AF%91+%E6%82%AC%E6%B5%AE%E7%AA%97',
    '%E6%B1%89%E5%8C%96+%E6%B3%A8%E5%85%A5',
    '%E7%BF%BB%E8%AF%91+%E6%82%AC%E6%B5%AE%E7%AA%97',
    'argos+translate+offline',
    'nllb+translation+local',
    'mozilla+firefox+translations+local+model',
    'windows+media+ocr+wrapper',
    'ui+automation+translate+window+text',
    'python+screen+overlay+tkinter+transparent',
    'keyboard+hook+select+translate',
    'claude+desktop+%E6%B1%89%E5%8C%96',
    'vscode+locale+zh-cn+nls',
    'vsix+language+pack+generator',
    'translation+memory+glossary+tool'
)

foreach ($q in $queries) {
    $decoded = [System.Uri]::UnescapeDataString($q)
    try {
        $json = gh api "search/repositories?q=$q&sort=stars&order=desc&per_page=8" 2>&1 | Out-String
        $obj = $json | ConvertFrom-Json
        Write-Output "===== $decoded   total=$($obj.total_count)"
        foreach ($item in $obj.items) {
            $desc = $item.description
            if ($null -eq $desc) { $desc = '' }
            $desc = ($desc -replace '\r?\n', ' ')
            if ($desc.Length -gt 120) { $desc = $desc.Substring(0, 120) }
            Write-Output ("  {0,7}  {1}  [{2}]  {3}" -f $item.stargazers_count, $item.full_name, $item.language, $desc)
        }
    }
    catch {
        Write-Output "===== $decoded   FAILED: $($_.Exception.Message)"
    }
    Start-Sleep -Milliseconds 900
}
