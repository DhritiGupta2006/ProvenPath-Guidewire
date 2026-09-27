Status: DONE

# 002: PolicyCenter Boot/Restart Timing & Product Model Survey Report

## 1. Timing Summary & Status
PolicyCenter was booted cold, tested against SOAP and REST endpoints, cleanly stopped, and warm restarted.
**PolicyCenter is currently RUNNING and ready on port 8180.**

| Operation | Start Time (UTC) | Ready Time (UTC) | Duration | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Cold Boot** | 2026-09-27 14:16:59 | 2026-09-27 14:25:17 | **8m 18s (498 s)** | Gradle tasks (`:genProductModelSources` etc.) took ~3m; Jetty server initialization took ~5m 18s. |
| **Clean Stop** | 2026-09-27 14:29:20 | 2026-09-27 14:29:38 | **18.0 s** | Triggered via `gwb.bat stopServer`. Jetty stopped cleanly and process exited. |
| **Warm Restart** | 2026-09-27 14:29:52 | 2026-09-27 14:33:24 | **3m 32s (212 s)** | Gradle tasks detected `UP-TO-DATE` (~30 s); Jetty initialization took ~3m 02s. |

### Ready Signal
- **Log Line**: `INFO Server.RunLevel ***** PolicyCenter ready *****`
- **HTTP Verification**: `curl -s -o NUL -w "%{http_code}" http://localhost:8180/pc/` returns `200` (redirects to `http://localhost:8180/pc/service/Start.do`).
- **Version Banner**: `[DEV mode - 10.2.1.1711] Guidewire PolicyCenter`.

---

## 2. Web Services, SOAP & REST Findings

### Web Service Endpoints
- **Service Directory Listing**: `http://localhost:8180/pc/ws/`
- **ProductModelAPI WSDL**: `http://localhost:8180/pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI?WSDL`
- **SOAP 1.1 Endpoint**: `http://localhost:8180/pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI/soap11`
- **SOAP 1.2 Endpoint**: `http://localhost:8180/pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI`

### Authentication Mechanism
Both authentication methods are supported and verified with `su` / `gw`:
1. **HTTP Basic Auth**: Standard `Authorization: Basic c3U6Z3c=` header (`curl -u su:gw`).
2. **Guidewire SOAP Header**: Header element in namespace `http://guidewire.com/ws/soapheaders`:
   ```xml
   <gwsoap:authentication xmlns:gwsoap="http://guidewire.com/ws/soapheaders">
     <gwsoap:username>su</gwsoap:username>
     <gwsoap:password>gw</gwsoap:password>
   </gwsoap:authentication>
   ```

### Working SOAP Request Shape (`ProductModelAPI`)
The operation `getPublicIdForCodeIdentifier` allows fast, read-only verification of whether a product, clause pattern, cov term, or category exists:

**Request (SOAP 1.1 with Basic Auth):**
```xml
POST /pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI/soap11 HTTP/1.1
Host: localhost:8180
Authorization: Basic c3U6Z3c=
Content-Type: text/xml; charset=utf-8
SOAPAction: ""

<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:prod="http://guidewire.com/pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI">
  <soapenv:Body>
    <prod:getPublicIdForCodeIdentifier>
      <prod:codeIdentifier>GLCGLCov</prod:codeIdentifier>
      <prod:productModelType>CLAUSEPATTERN</prod:productModelType>
    </prod:getPublicIdForCodeIdentifier>
  </soapenv:Body>
</soapenv:Envelope>
```

**Response (Match Found):**
```xml
<tns:Envelope xmlns:tns="http://schemas.xmlsoap.org/soap/envelope/">
  <tns:Body>
    <getPublicIdForCodeIdentifierResponse xmlns="http://guidewire.com/pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI">
      <return>GLCGLCov</return>
    </getPublicIdForCodeIdentifierResponse>
  </tns:Body>
</tns:Envelope>
```
*(If the pattern or product does not exist, `<getPublicIdForCodeIdentifierResponse>` returns empty without `<return>`)*.

**Other useful operations in `ProductModelAPI`:**
- `getAvailableClausePatterns(lookupRoot, offeringCode, lookupDate)`: Returns all available clause patterns for an entity/line.
- `getAvailableQuestions(lookupRoot, offeringCode, lookupDate)`: Returns available question sets.
- `synchronizeProductModel()`: In maintenance mode, pushes XML pattern updates into the database.

### REST API Status
- Querying `http://localhost:8180/pc/rest/` returns JSON 404 (`gw.api.rest.exceptions.NotFoundException`), indicating the REST servlet engine is active.
- Querying `http://localhost:8180/pc/rest/apis` returns the published API registry:
  - `/apis` (API list)
  - `/system/v1/server` (Server tools)
- **Result:** No REST product-model or policy submission APIs are enabled or published under `modules/configuration/config/integration/apis/published-apis.yaml`. SOAP (`ProductModelAPI`) and direct XML configuration are the valid integration mechanisms on this instance.

---

## 3. Product Model Survey (B1 - B8)

### B1. General Liability Line
- **Location**: `modules/configuration/config/resources/productmodel/policylinepatterns/GLLine`
- **Files**: `GLLine.xml`, `GLLine-lookups.xml`, `GLLine.properties`, and `coveragepatterns/` directory.
- **Line Code Identifier**: `GLLine` (policy line entity subtype: `GeneralLiabilityLine`).
- **Coverage Categories**: Defined under `<CoverageCategories>` in `GLLine.xml`:
  - `GLGroup` (priority 10)
  - `GLClaimsMade` (priority 20)
  - `GLContractualAll` (priority 30)
  - `GLDesignated` (priority 40)
  - `GLEmployment` (priority 50)
  - `GLLiquorAll` (priority 60)
  - `GLPollutionAll` (priority 70)
  - `GLProfessionalEO` (priority 75)
  - `GLY2K` (priority 80)
  - `GLOther` (priority 99)

### B2. Coverage Pattern Template
- **Root Element**: `<CoveragePattern>`
- **Key Attributes**:
  - `codeIdentifier`: unique string code (e.g. `GLCGLCov`, `GLElectronicDataLiability`)
  - `public-id`: matches `codeIdentifier`
  - `coverageCategory`: category code (e.g. `GLOther` or `GLGroup`)
  - `coverageSubtype="GeneralLiabilityCov"`
  - `owningEntityType="GeneralLiabilityLine"`
  - `policyLinePattern="GLLine"`
  - `existence="Required | Suggested | Electable"`
  - `priority="<int>"`
  - `lookupTableName="GLCov"`
  - `reregisterExistingModel="true"`
- **Money Limit CovTerm**:
  - *Option format*: `<OptionCovTermPattern aggregationModel="ag" choiceLookupTableName="GLCovOpt" codeIdentifier="..." lookupTableName="GLCovTerm" modelType="Limit" priority="1" public-id="..." valueType="money">` with child `<Options>` containing `<CovTermOpt codeIdentifier="..." currency="usd" optionCode="..." priority="1" public-id="..." value="1000000.0000"/>`.
  - *Direct numeric format*: `<DirectCovTermPattern coverageColumn="DirectTerm1" lookupTableName="GLCovTerm" modelType="Limit" priority="1" valueType="money"><LimitsSet><CovTermLimits .../></LimitsSet></DirectCovTermPattern>`.
- **Money Deductible CovTerm**:
  - Defined with `modelType="Deductible"` and `valueType="money"`, using either `OptionCovTermPattern` (with `<CovTermOpt>` amounts such as `1000.0000`, `2500.0000`) or `DirectCovTermPattern`.
- **Availability Script**:
  - CDATA Gosu script directly supported under `<AvailabilityScript>`, for example:
    `<![CDATA[return GeneralLiabilityLine.GLCGLCovExists]]>`.

### B3. Coverage Registration with Line
- **Drop-in XML**: Placing `<CoverageCode>.xml` into `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/` is sufficient to register the coverage pattern.
- **No listing in `GLLine.xml`**: Individual coverage patterns are **not** enumerated inside `GLLine.xml`.
- **Lookups requirement**: Each coverage pattern requires a companion lookups file:
  `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/<CoverageCode>-lookups.xml`.
  This file contains `<CoverageLookup>` and `<CovTermLookup>` tags specifying `Availability="Available"`, `PolicyLinePatternCode="GLLine"`, and `StartEffectiveDate="2000-01-01 00:00:00.000"`.

### B4. Products & Line Reuse
- **File Structure**: `resources/productmodel/products/<ProductCode>/<ProductCode>.xml`.
- **Root Element**:
  ```xml
  <Product abbreviation="GL" codeIdentifier="GeneralLiability" defaultTermType="Annual" priority="50" productAccountType="Any" productType="Commercial" public-id="GeneralLiability">
  ```
- **Line Reference**: Lines are linked using:
  ```xml
  <ProductPolicyLinePatterns>
    <ProductPolicyLinePattern codeIdentifier="..." policyLinePattern="GLLine" public-id="..."/>
  </ProductPolicyLinePatterns>
  ```
- **Line Pattern Reuse**: **YES.** Multiple products can reference the same line pattern. For example, both `GeneralLiability` and `CommercialPackage` link directly to `policyLinePattern="GLLine"`. This confirms that a new product `SMCyber` can reuse `GLLine` without defining new LOB data entities.

### B5. Display Names
- **Location**: `modules/configuration/config/locale/productmodel.display.properties`
- **Key Formats**:
  - Product: `Product_<ProductCode>.Name = <Display Name>`
  - Coverage Pattern: `PolicyLine_<LineCode>.CoveragePattern_<CovCode>.Name = <Display Name>`
  - Coverage Description: `PolicyLine_<LineCode>.CoveragePattern_<CovCode>.Description = <Description>`
  - CovTerm Name: `PolicyLine_<LineCode>.CoveragePattern_<CovCode>.CovTerm_<TermCode>.Name = <Term Name>`
  - CovTerm Option: `PolicyLine_<LineCode>.CoveragePattern_<CovCode>.CovTerm_<TermCode>.CovTermOpt_<OptPublicId>.Description = <Amount>`

### B6. Additional Coverage & Product Requirements
1. **Lookups XML**:
   - Coverage: `<CovCode>-lookups.xml` under `coveragepatterns/`.
   - Product: `<ProductCode>-lookups.xml` under `products/<ProductCode>/` with `<ProductLookup>` declaring the product `Available`.
2. **Category Registration**:
   - If using a new category (e.g. `GLCyber`), it must be declared in `GLLine.xml` under `<CoverageCategories>`. If using an existing category (`GLOther` or `GLGroup`), no modification to `GLLine.xml` is necessary.
3. **Display Properties**:
   - Entries in `productmodel.display.properties` for user-facing strings.
4. **Data Entities**:
   - When using existing `GeneralLiabilityLine` / `GeneralLiabilityCov`, no entity extensions (`.eti`/`.etx`) or Gosu schema compilations are required.

### B7. Advanced Product Designer (APD) Status
- **Status**: **YES, Present and Enabled.**
- **Evidence**:
  - Gosu modules: `modules/configuration/gsrc/gw/apd/` (including `APDCreateCoveragesAndExclusionsAndConditionsHelper.gs`, `APDProductValidator.gs`, `APDClauseHierarchyTreeData.gs`).
  - Config directories: `modules/configuration/config/apd/` and `modules/configuration/config/web/pcf/line/apd/`.

### B8. Dev-Mode Product-Model Reload vs. Restart
- **Restart Required**: Product model XML definitions and synchronization are loaded during server initialization (log: `Configuration.ProductModel Starting Product Model pattern loading...`).
- While `ProductModelAPI.synchronizeProductModel()` exists for maintenance mode syncs, a server warm restart (`3m 32s`) is the standard, deterministic dev-mode mechanism that does not corrupt runtime memory or active user sessions.

---

## 4. Recommendation for SMCyber (Smallest File Set)

To make 3 new coverages (`SMCyberDataBreach`, `SMCyberExtortion`, `SMCyberBI`) appear under new product `SMCyber` in New Submission with minimal risk and zero entity modifications:

### Recommended Files (8 XML files + 1 properties file)
1. **New Product Definition**:
   - `modules/configuration/config/resources/productmodel/products/SMCyber/SMCyber.xml`
     - `<Product>` linking to `policyLinePattern="GLLine"` via `<ProductPolicyLinePattern>`.
   - `modules/configuration/config/resources/productmodel/products/SMCyber/SMCyber-lookups.xml`
     - `<ProductLookup>` setting `Availability=Available`.
2. **Three Coverage Patterns on GLLine** (in `modules/configuration/config/resources/productmodel/policylinepatterns/GLLine/coveragepatterns/`):
   - `SMCyberDataBreach.xml` & `SMCyberDataBreach-lookups.xml`
   - `SMCyberExtortion.xml` & `SMCyberExtortion-lookups.xml`
   - `SMCyberBI.xml` & `SMCyberBI-lookups.xml`
   - All 3 use `coverageSubtype="GeneralLiabilityCov"`, `owningEntityType="GeneralLiabilityLine"`, `policyLinePattern="GLLine"`, `coverageCategory="GLOther"`.
3. **Display Properties**:
   - Append product, coverage, and term display names to `modules/configuration/config/locale/productmodel.display.properties`.

*(Optional: If Chinmay prefers a dedicated category `GLCyber` instead of `GLOther`, add 1 `<CoverageCategory>` line into `GLLine.xml`)*.

---

## 5. Open Questions & Risks

1. **New Submission Wizard PCF Mapping**:
   - While `SMCyber` references `GLLine`, PolicyCenter's New Submission wizard checks product-to-wizard configurations. We should confirm whether `SMCyber` automatically adopts the standard `GeneralLiability` submission flow or requires a product-to-submission-flow mapping in `productmodel/products/SMCyber/SMCyber.xml` (e.g. `ProductQuestionSetPatterns` or PCF `JobWizard` condition).
2. **Demo Timing (Restart Duration)**:
   - A warm restart takes **3m 32s (212 seconds)**. If the demo includes deploying new coverages live, the pipeline must budget ~3.5 minutes for server bounce or show pre-deployed and newly-deployed states.
3. **SOAP Verification Script**:
   - The laptop side / PC agent can verify pattern availability immediately after restart using `ProductModelAPI.getPublicIdForCodeIdentifier` in less than 50 ms via curl with HTTP Basic Auth.
