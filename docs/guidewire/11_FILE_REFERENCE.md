# PolicyCenter File Reference

This document provides a concise index of the most important PolicyCenter files and directories discovered at `C:\GW10\PolicyCenter`. Focus is on product configuration, rules, rating, and integration capabilities relevant to building ProvenPath (a pre-commit compliance gate).

## 1. Entities & Metadata
Entity definitions determine the data model of the application. Found in `modules\configuration\config\metadata\entity`.

| Path | Purpose | Relevant Entity | Why it matters |
|------|---------|-----------------|----------------|
| `config\metadata\entity\PolicyPeriod.eti` | Core entity representing a policy revision. | `PolicyPeriod` | Crucial for understanding rating, validation, and lifecycle events. Most rules operate on this entity. |
| `config\metadata\entity\PolicyLine.eti` | Abstract base entity for all LOBs. | `PolicyLine` | Fundamental for understanding line-specific extensions and patterns. |
| `config\metadata\entity\Account.eti` | Stores account-level information. | `Account` | Required for account validations, contact relationships, and cross-policy checks. |

## 2. Product Model
Defines the insurance products, lines, coverages, and questions. Found in `modules\configuration\config\resources\productmodel`.

| Path | Purpose | Relevant Config | Why it matters |
|------|---------|-----------------|----------------|
| `config\resources\productmodel\products\` | Defines available insurance products (e.g., Personal Auto). | Product definition | Controls line availability, eligibility rules, and broad product settings. |
| `config\resources\productmodel\policylinepatterns\` | Defines coverages, conditions, exclusions, and modifiers per LOB. | PolicyLine pattern | Core rating and rules input; dictates what risk data can be captured. |
| `config\resources\productmodel\questionsets\` | Defines risk assessment questions. | Question Sets | Used to gather underwriting info; directly informs compliance and validation rules. |

## 3. Business Rules (Gosu Rules)
Contains the executable logic for validations, underwriting, assignment, etc. Found in `modules\configuration\config\rules`.

| Path | Purpose | Relevant Config | Why it matters |
|------|---------|-----------------|----------------|
| `config\rules\Validation` | Validation rule sets (e.g., PolicyPeriod validation). | Validation Rules | Primary source of pre-quote and pre-bind compliance checks. Key target for ProvenPath. |
| `config\rules\Preupdate` | Rules executed immediately before committing to the DB. | Preupdate Rules | Catches late-stage modifications and enforces strict data invariants. |
| `config\rules\Assignment` | Rules dictating task and entity assignment. | Assignment Rules | Defines how compliance tasks/issues are routed to underwriters. |

## 4. Gosu Source (GSRC)
Contains custom business logic, rating algorithms, and utility classes. Found in `modules\configuration\gsrc`.

| Path | Purpose | Relevant Class | Why it matters |
|------|---------|----------------|----------------|
| `gsrc\gw\rating\AbstractRatingEngine.gs` | Base rating algorithm implementation. | `AbstractRatingEngine` | The foundation for premium calculation. Changes here affect all rating outputs. |
| `gsrc\gw\plugin\` | Implementations for registered plugins. | Various plugin classes | Connects internal APIs to the external plugin interfaces. |
| `gsrc\gw\validation\` | Gosu validation logic. | Validation Classes | Complementary to Gosu rules; contains more complex validation logic across the product lifecycle. |

## 5. UI (PCF)
Page Configuration Format files determine the PolicyCenter web interface. Found in `modules\configuration\config\web\pcf`.

| Path | Purpose | Relevant Config | Why it matters |
|------|---------|-----------------|----------------|
| `config\web\pcf\job\submission\SubmissionWizard.pcf` | The main wizard for creating new policies. | Submission Wizard | Shows how users progress through capturing risk data. |
| `config\web\pcf\policy\PolicyFile.pcf` | Core UI for viewing bound policies. | PolicyFile | Determines what data is visible post-bind. |

## 6. Plugins & Integration
External system integrations and core behavior overrides. Found in `modules\configuration\config\plugin\registry`.

| Path | Purpose | Relevant Config | Why it matters |
|------|---------|-----------------|----------------|
| `config\plugin\registry\BillingMessageTransport.gwp` | Configures sending messages to BillingCenter. | `BillingMessageTransport` | Critical for understanding how policy changes affect billing. |
| `config\plugin\registry\PolicyPlugin.gwp` | Core policy operations plugin. | `IPolicyPlugin` | Extends base policy behavior, such as policy numbering and initialization. |
| `config\messaging\` | Message transport configurations. | Messaging destinations | Used for real-time and asynchronous integration with external systems. |
