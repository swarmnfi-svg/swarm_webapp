# Load backend/.env and start Spring Boot (Nova LLM keys included)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -gt 0) {
            $name = $line.Substring(0, $idx).Trim()
            $value = $line.Substring($idx + 1).Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
    Write-Host "Loaded Nova LLM keys from .env"
} else {
    Write-Warning "No .env file. Copy .env.example to .env and add your API keys."
}

.\mvnw.cmd spring-boot:run
