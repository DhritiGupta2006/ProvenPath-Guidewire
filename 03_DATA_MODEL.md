# PolicyCenter Data Model

This document provides a technical overview of the core data model in Guidewire PolicyCenter, focusing on key entities and their relationships. The source of truth for these definitions are the `.eti` and `.etx` files located in `C:\GW10\PolicyCenter\modules\configuration\config\metadata\entity\` and `extensions\entity\`.

## Important Entities and Relationships

The PolicyCenter data model is centered around the relationship between an `Account`, the `Policy` belonging to the account, the `Job` (workflow) modifying the policy, and the `PolicyPeriod` (effective-dated version of the policy).

### Account (`Account.eti`)
An account represents a person or company that applies for or purchases policies.
- **Key Attributes:**
  - `AccountNumber` (shorttext): Unique identifier.
  - `AccountStatus` (typekey: AccountStatus): Defaults to Active.
  - `LinkContacts` (bit): Indicates if contacts sync with an external CMS.
  - `OriginationDate` (datetime)
- **Relationships:**
  - `PrimaryLocation` (edgeForeignKey to `AccountLocation`): The main address.
  - `AccountContacts` (array of `AccountContact`): Contacts associated with the account.
  - `AccountLocations` (array of `AccountLocation`): All locations.
  - `JobGroups` (array of `JobGroup`): Grouping of jobs for this account.
- **Extensions & Delegations:** Implements `UserRoleOwner`, `NoteContainer`, `Validatable`. The extension file `Account.etx` overrides `PrimaryLanguage` and `PrimaryLocale` defaults to `en_US` and provides custom database indexes.

### Policy (`Policy.eti`)
Represents the container for a policy across its entire lifecycle. It does not hold effective-dated information (which belongs to `PolicyPeriod`), but rather high-level shared attributes.
- **Key Attributes:**
  - `ProductCode` (patterncode): The Product defining what kind of policy this is.
  - `OriginalEffectiveDate` (dateonly)
  - `LossHistoryType` (typekey)
- **Relationships:**
  - `Account` (foreignkey to `Account`): The account this policy belongs to.
  - `Jobs` (array of `Job`): All transactions/workflows run on this policy.
  - `Periods` (array of `PolicyPeriod`): All effective-dated branches (versions) of this policy.
  - `PriorPolicies` (array of `PriorPolicy`)
- **Extensions & Delegations:** Implements `UserRoleOwner`, `NoteContainer`. Defined as `type="effdatedcontainer"`.

### PolicyPeriod (`PolicyPeriod.eti`)
Allows a point-in-time reconstruction of all key policy attributes. It is an effective-dated branch (`type="effdatedbranch"`) belonging to a Policy.
- **Key Attributes:**
  - `PolicyNumber` (policynumber): May be different from the core policy number on the associated Policy.
  - `TermNumber` (integer): Incremented on renewal/rewrite.
  - `Status` (typekey: PolicyPeriodStatus): The period's status (e.g., Draft, Quoted, Bound).
  - Denormalized financial fields: `TotalPremiumRPT`, `TotalCostRPT`.
- **Relationships:**
  - `Policy` (foreignkey to `Policy`): The container policy.
  - `Job` (foreignkey to `Job`): The job that created/modified this period.
  - `Lines` (array of `PolicyLine`): The LOB-specific data (e.g., Auto, Property).
  - `PolicyLocations` (array of `PolicyLocation`): Locations active for this period.
- **Extensions & Delegations:** 
  - `PolicyPeriod.etx` injects LOB-specific transaction arrays (e.g., `BATransactions`, `BOPTransactions`, `CPTransactions`, `GLTransactions`, `WCTransactions`, `HOPTransactions`).
  - Implements `EffDatedBranch`, `AnswerContainer`, and `ReinsurableCoverable`.

### Job (`Job.eti` and Subtypes like `Submission.eti`)
A workflow process object relating to one or more versions of a policy. `Job` is an abstract entity (`abstract="true"`).
- **Key Attributes (Job):**
  - `JobNumber` (varchar)
  - `CloseDate` (datetime)
  - `Description` (mediumtext)
- **Relationships (Job):**
  - `Policy` (foreignkey to `Policy`)
  - `SelectedVersion` (edgeForeignKey to `PolicyPeriod`): The branch selected for binding.
  - `Periods` (array of `PolicyPeriod`): All periods evaluated under this job.
- **Submission Subtype (`Submission.eti`):**
  - Inherits from `Job`. Represents new business.
  - Adds fields like `SubmissionDate`, `DateQuoteNeeded`, `RejectReason`, `BindOption`, and `QuoteType`.
- **Extensions & Delegations:** Implements `UserRoleOwner`.

## Entity Metadata Structure & Foreign Keys
PolicyCenter uses a distinct XML-based schema definition:
- `<entity>`: Base definition (table, type).
- `<column>`: Standard scalar attributes.
- `<foreignkey>` and `<edgeForeignKey>`: 1:1 or N:1 relationships. `edgeForeignKey` is often used for performance optimization.
- `<array>`: 1:N relationships.
- `<typekey>`: References to `typelists` (e.g., `AccountStatus`, `PolicyPeriodStatus`).
- `<implementsEntity>` and `<implementsInterface>`: Defines delegations, allowing entities to share common behaviors (like `UserRoleOwner` for assignments).

Foreign Keys strictly enforce referential integrity between `Job` -> `Policy`, `PolicyPeriod` -> `Policy`, and `Policy` -> `Account`.

## Extensions
Extensions (`*.etx` files) are heavily used to avoid modifying base `.eti` files. As seen in `PolicyPeriod.etx`, line-of-business specific data (like `WCTransactions` for Workers' Comp) is injected into the base `PolicyPeriod` entity at the configuration level rather than being part of the core out-of-the-box platform entity, maintaining a decoupled architecture for lines of business.
