param(
    [Parameter(Mandatory=$true)]
    [string]$IpAddress
)

Write-Host "Setting up LeadJin with IP: $IpAddress"

# Update capacitor.config.ts
if (Test-Path 'capacitor.config.ts') {
    $content = Get-Content 'capacitor.config.ts' -Raw
    $content = $content -replace 'http://[^"'']+:300[01]', "http://$IpAddress`:3001"
    $content | Set-Content 'capacitor.config.ts' -NoNewline
    Write-Host "[OK] capacitor.config.ts updated"
} else {
    Write-Host "[WARNING] capacitor.config.ts not found"
}

# Update capacitor.config.json
if (Test-Path 'capacitor.config.json') {
    $content = Get-Content 'capacitor.config.json' -Raw
    $content = $content -replace 'http://[^"]+:300[01]', "http://$IpAddress`:3001"
    $content | Set-Content 'capacitor.config.json' -NoNewline
    Write-Host "[OK] capacitor.config.json updated"
} else {
    Write-Host "[WARNING] capacitor.config.json not found"
}

# Update network_security_config.xml - add IP if not exists
if (Test-Path 'android\app\src\main\res\xml\network_security_config.xml') {
    [xml]$xml = Get-Content 'android\app\src\main\res\xml\network_security_config.xml'
    $domainConfig = $xml.SelectSingleNode('//domain-config')
    
    # Check if IP already exists
    $exists = $false
    foreach ($domain in $domainConfig.domain) {
        if ($domain.InnerText -eq $IpAddress) {
            $exists = $true
            break
        }
    }
    
    if (-not $exists) {
        $newDomain = $xml.CreateElement('domain')
        $newDomain.SetAttribute('includeSubdomains', 'true')
        $newDomain.InnerText = $IpAddress
        $domainConfig.AppendChild($newDomain) | Out-Null
        $xml.Save('android\app\src\main\res\xml\network_security_config.xml')
        Write-Host "[OK] network_security_config.xml updated"
    } else {
        Write-Host "[OK] network_security_config.xml already contains IP"
    }
} else {
    Write-Host "[WARNING] network_security_config.xml not found"
}

# Fix Java version
if (Test-Path 'android\app\capacitor.build.gradle') {
    $content = Get-Content 'android\app\capacitor.build.gradle' -Raw
    $content = $content -replace 'VERSION_21', 'VERSION_17'
    $content | Set-Content 'android\app\capacitor.build.gradle' -NoNewline
    Write-Host "[OK] Java version fixed to 17"
} else {
    Write-Host "[WARNING] capacitor.build.gradle not found"
}

Write-Host "`nSetup complete!"
