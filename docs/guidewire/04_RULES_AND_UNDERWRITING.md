# Rules and Underwriting in PolicyCenter

This document outlines the architecture and execution of rules and underwriting within the PolicyCenter codebase, based on analysis of the C:\GW10\PolicyCenter directory.

## 1. Validation Rules

Validation rules ensure that entities within PolicyCenter meet data integrity and business requirements before they can be saved, quoted, or bound.

### Where Defined
- **Gosu Validation Rule Sets:** Located under C:\GW10\PolicyCenter\modules\configuration\config\rules\Validation\. These are divided by entity type (e.g., AccountValidationRules, ContactValidationRules, RegionValidationRules).
- **Field Validators:** Regex and Gosu-based field formatting validations are defined in C:\GW10\PolicyCenter\modules\configuration\config\fieldvalidators\FieldValidators.xml.

### Execution and Structure
- Validation rules use the Gosu Rule Engine (.gr files).
- They have a doCondition() method returning a boolean, and a doAction() method.
- When an entity fails validation, the rule calls a rejection method, e.g., ccount.reject(TC_LOADSAVE, ...).
- **Validation Levels:** Rejections are tied to a specific ValidationLevel typekey (e.g., TC_LOADSAVE for saving data, TC_DEFAULT, TC_BIND for preventing binding).
- Example: C:\GW10\PolicyCenter\modules\configuration\config\rules\Validation\AccountValidationRules_dir\RelatedAccounts.gr (Lines 18-27) checks for duplicate relationships and issues a TC_LOADSAVE rejection.

## 2. Underwriting Rules (BizRules)

PolicyCenter 10 uses the Business Rules (BizRules) engine for Underwriting, moving away from legacy Gosu .gr underwriting rules to a UI-managed, metadata-backed engine.

### Core Entities and Structure
- **UWRule (UWRule.eti):** The primary entity representing an underwriting rule. It extends Rule and implements gw.bizrules.domain.RuleVersionDependent (Lines 7-10). It is strictly tied to a UWIssueType.
- **UWIssueType (UWIssueType.eti):** Defines a category of underwriting concern (e.g., "High Risk Driver").
- **UWIssue (UWIssue.eti):** The runtime instantiation of an issue raised on a PolicyPeriod. It contains properties such as Active, ApprovalBlockingPoint, and ApprovalDurationType (Lines 43-89).
- **Authority Profiles:** Evaluated via entities like UWAuthorityProfile.eti and UWAuthorityGrant.eti to determine if a user has sufficient privileges to approve an issue.

### Execution
- As a job progresses (e.g., during Quote), the BizRules engine evaluates active UWRule instances against the PolicyPeriod.
- If a condition is met, a UWIssue is instantiated and associated with the PolicyPeriod.
- The UWIssue checks its BlockingPoint (e.g., Blocks Quote, Blocks Bind). If the job attempts to pass this point, it is halted unless an Underwriter with a matching UWAuthorityGrant approves it.
- Comparators like UWIssueValueComparatorWrapper.gs (in C:\GW10\PolicyCenter\modules\configuration\gsrc\gw\job\uw\) are used to evaluate if an underwriter's authority limit exceeds the issue's value.

## 3. Business Rules (Gosu Rule Engine)

Beyond validation, the traditional Gosu rule engine drives many automated background processes.

- **Rule Sets:** Found in C:\GW10\PolicyCenter\modules\configuration\config\rules\. Key sets include:
  - Assignment: Defines how Jobs, Activities, and Accounts are routed to users (e.g., GlobalJobAssignmentRules.grs).
  - Renewal: Defines pre-renewal checks and automated renewal flows.
  - EventMessage: Triggers integration messages to downstream systems.
- **Mechanics:** Each rule is a Gosu class annotated with @gw.rules.RuleName. Rules execute in order based on order.txt files located in each rule directory (e.g., C:\GW10\PolicyCenter\modules\configuration\config\rules\Assignment\DefaultGroupAccountAssignmentRules_dir\order.txt).

## 4. Connections to Entities and Workflows

Rules are deeply intertwined with the PolicyPeriod lifecycle and entity state:
- **ValidationResult:** When validation rules run, failures are aggregated into ValidationResult and ValidationIssue objects, returning a localized message to the UI or API caller.
- **Workflow Pauses:** If an underwriting rule generates a UWIssue with a blocking point of "Blocks Quote", the submission workflow halts at the Quote step. It remains in an "Underwriting Review" state until the issue is either resolved by changing the underlying entity data (making the rule condition false) or approved by an authorized user via UWIssueApprovalUtil.gs.
