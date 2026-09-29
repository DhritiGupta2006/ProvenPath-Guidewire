# PolicyCenter PCF UI Architecture

The Guidewire Page Configuration Framework (PCF) is an XML-based UI framework used to define screens, flows, and data bindings in PolicyCenter.

## Core Architecture
- **Location**: All raw PCF files reside in `C:\GW10\PolicyCenter\modules\configuration\config\web\pcf\`.
- **Generation**: At build time, Guidewire compiles `.pcf` files into corresponding Gosu classes (stored under `modules/configuration/generated/pcf/`). This ensures UI bindings are strongly typed and statically validated against the data model.
- **Validation**: PCF elements conform to `modules/pcf.xsd`, a massive schema defining all possible UI widgets, layout configurations, and attributes.

## Common PCF Element Types

- **LocationGroup**: Serves as a navigational container that groups multiple locations (pages) together, usually rendering as a left-hand navigation menu. 
  - *Example*: `PolicyFile.pcf`
- **Wizard / JobWizard**: Defines a multi-step sequential process. Contains multiple `JobWizardStep` or `WizardStepGroup` tags.
  - *Example*: `SubmissionWizard.pcf`
- **Page / Screen**: `Page` represents a full web page, while `Screen` represents the content area which typically defines a `Toolbar`, alert bars, and holds `PanelRef` elements.
- **DetailViewPanel (DV)**: Represents a form layout. Uses `<InputColumn>` tags to align fields vertically. Contains widgets like `TextInput`, `DateInput`, or `RangeInput`.
- **ListViewPanel (LV)**: Represents a data table. Uses a `<RowIterator>` to loop over a Gosu array/query and `<Row>` to define columns using widgets like `TextCell` or `DateCell`.
- **InputSet**: A reusable grouping of fields that can be injected into different `DetailViewPanel`s to reduce duplication (e.g., `AccountInfoInputSet.pcf`).

## Important Screens & Flows

### 1. Submission Wizard (`job/submission/SubmissionWizard.pcf`)
The central transaction flow for binding a new policy. It uses `<JobWizard>` and defines steps such as:
- **Offering** (`OfferingScreen`)
- **PreQualification** (`SubmissionWizard_PreQualificationScreen`)
- **PolicyInfo** (`SubmissionWizard_PolicyInfoScreen`)
- **RiskAnalysis**, **ViewQuote**, and **BillingInfo**

### 2. Policy File (`policyfile/PolicyFile.pcf`)
The post-bind policy viewing interface. It is a `<LocationGroup>` that points to various aspect of a bound policy using `<LocationRef>`:
- **Summary** (`PolicyFile_Summary`)
- **Contacts** (`PolicyFile_Contacts`)
- **Transactions** (`PolicyFile_Transactions`)
- **Notes** / **Documents**

### 3. Policy Info Detail View (`job/submission/SubmissionWizard_PolicyInfoDV.pcf`)
An example of a form layout defining input columns. It references nested UI components like `AccountInfoInputSet`, `SecondaryNamedInsuredInputSet`, and `UWCompanyInputSet`.

### 4. Billing Invoices ListView (`account/billing/BillingInvoicesLV.pcf`)
An example of a table layout. It uses `<RowIterator>` bound to `account.retrieveAccountInvoices()` and provides filtering via `<ToolbarFilter>` and sorting via `<IteratorSort>`.

## Connecting UI to Backend Behavior

PCF files strictly separate view from business logic, connecting to the backend exclusively via Gosu expressions:

1. **Data Binding (`value`)**: Widgets bind to the Gosu object model. For example, `<DateInput value="submission.DateQuoteNeeded">` maps the field directly to the `Submission` entity.
2. **Context Variables (`<Variable>`)**: Pages define state using `<Variable>` and `<Require>` tags. Helper classes are frequently instantiated to offload complex UI logic (e.g., `initialValue="new gw.api.web.job.JobWizardHelper(CurrentLocation)"`).
3. **Actions (`action`)**: Buttons and links trigger Gosu functions. Example: `<ButtonInput action="policyPeriod.autoSelectUWCompany()"/>`.
4. **Visibility & Security (`visible`, `editable`)**: Render logic is evaluated dynamically using Gosu and the Guidewire permission system. For instance:
   - `visible="policyPeriod.Policy.Product.ProductType == TC_COMMERCIAL"`
   - `editable="perm.System.multicompquote"`

These bindings are strictly validated by the Gosu compiler, preventing common web issues like typos in variable names or invalid method calls.
