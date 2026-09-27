# ProvenPath SMCyber Overlay Template - Installation & Uninstallation Guide

This overlay template provides the minimal, non-invasive PolicyCenter configuration file set required to deploy the **SMCyber** ("SME Cyber Insurance") product with 3 coverages on the existing **GLLine** (`GeneralLiabilityLine`).

No Guidewire base product line files, data model extensions, or Java/Gosu entity schema files are modified.

---

## 1. File Inventory

### New Files (8 XML Files)
Copied directly into `modules/configuration/config/`:
1. `resources/productmodel/products/SMCyber/SMCyber.xml`
2. `resources/productmodel/products/SMCyber/SMCyber-lookups.xml`
3. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberDataBreachCov.xml`
4. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberDataBreachCov-lookups.xml`
5. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberExtortionCov.xml`
6. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberExtortionCov-lookups.xml`
7. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberBusinessInterruptionCov.xml`
8. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberBusinessInterruptionCov-lookups.xml`

### Modified File (1 Appended Block)
- `modules/configuration/config/locale/productmodel.display.properties`
  - Appends the marked fragment from `config/locale/productmodel.display.properties.smcyber-fragment` (marked with `# >>> ProvenPath SMCyber >>>` ... `# <<< ProvenPath SMCyber <<<`).

---

## 2. Installation Steps

### Prerequisites
1. Ensure PolicyCenter server is stopped:
   ```cmd
   cd C:\GW10\PolicyCenter
   gwb.bat stopServer
   ```
2. Backup `modules/configuration/config/locale/productmodel.display.properties`.

### Copy Files
From repo root (`C:\ProvenPath`):
```powershell
# Copy new product files
New-Item -ItemType Directory -Force -Path "C:\GW10\PolicyCenter\modules\configuration\config\resources\productmodel\products\SMCyber"
Copy-Item "policycenter\overlay-template\config\resources\productmodel\products\SMCyber\*" "C:\GW10\PolicyCenter\modules\configuration\config\resources\productmodel\products\SMCyber\" -Force

# Copy new coverage pattern files
Copy-Item "policycenter\overlay-template\config\resources\productmodel\policylinepatterns\GLLine\coveragepatterns\SMCyber*" "C:\GW10\PolicyCenter\modules\configuration\config\resources\productmodel\policylinepatterns\GLLine\coveragepatterns\" -Force

# Append display properties fragment
Get-Content "policycenter\overlay-template\config\locale\productmodel.display.properties.smcyber-fragment" | Add-Content "C:\GW10\PolicyCenter\modules\configuration\config\locale\productmodel.display.properties"
```

### Restart PolicyCenter
A warm restart is required to ingest and synchronize new product model XML patterns into the database (~3.5 minutes):
```cmd
cd C:\GW10\PolicyCenter
gwb.bat runServer
```
Wait for log line: `INFO Server.RunLevel ***** PolicyCenter ready *****`.

---

## 3. Uninstallation Steps

1. Stop PolicyCenter:
   ```cmd
   cd C:\GW10\PolicyCenter
   gwb.bat stopServer
   ```
2. Remove the 8 new files:
   ```powershell
   Remove-Item -Recurse -Force "C:\GW10\PolicyCenter\modules\configuration\config\resources\productmodel\products\SMCyber"
   Remove-Item -Force "C:\GW10\PolicyCenter\modules\configuration\config\resources\productmodel\policylinepatterns\GLLine\coveragepatterns\SMCyber*"
   ```
3. Remove the marked fragment from `modules/configuration/config/locale/productmodel.display.properties` (or restore from backup).
4. Restart PolicyCenter:
   ```cmd
   cd C:\GW10\PolicyCenter
   gwb.bat runServer
   ```
