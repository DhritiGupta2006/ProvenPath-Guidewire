# 08 Workflows and Job Lifecycle

In Guidewire PolicyCenter, a **Job** (also known as a transaction) represents a unit of work that modifies or creates a policy. The lifecycle of a job, its states, and transitions are managed by Gosu **JobProcess** classes, while long-running automated steps are orchestrated by the **Workflow** engine via XML-based workflow definitions.

## 1. Important Insurance Workflows

### 1.1 Submission
The Submission workflow is responsible for quoting and issuing a new policy. It is managed by `gw.job.SubmissionProcess`.
*   **Key Transitions:**
    *   `start()`: Initializes the submission. Creates the `Job` and sets the initial state to `New`.
    *   `beginEditing()`: Moves the policy from `New` to `Draft` status.
    *   `requestQuote()`: Initiates the quoting process (handled by `QuoteProcess.gs`), shifting the status to `Quoting` and then `Quoted` (or `Rated`).
    *   `bind()` / `bindOnly()` / `issue()`: Converts the quote into a bound policy. `BindAndIssue` runs through form inference, sequence assignment, and issuance.
    *   **Terminal States:** `decline()` (Declined by Insurer) or `notTake()` (Not Taken by Insured).
*   **Entity:** `Submission` (extends `Job`) includes specific fields like `DateQuoteNeeded`, `RejectReason`, `BindOption`, and `QuoteType` (Quick Quote vs Full Application).

### 1.2 Renewal
Renewals often involve automated, time-based processing with escalation paths for underwriter review. Managed by `gw.job.RenewalProcess`.
*   **Automated Workflows:**
    *   `StartRenewalWF.1.xml`: Bootstraps the renewal. Invokes `beginAutomaticRenewal()` which evaluates pre-renewal direction and product availability.
    *   `PendingRenewalWF.1.xml`: Manages the timeline of a pending renewal. Triggers checks at specific intervals (e.g., `pendingRenewalFirstCheck` at PeriodStart - 80 days).
    *   `PendingNonRenewalWF.1.xml`: Handles automated non-renewal notices and processing.
    *   `IssueRenewalWF.1.xml` / `RenewalTimeoutWF.1.xml`: Manages automated binding and timeouts.
*   **Lifecycle events:** If automated checks fail or require referral (e.g., UW issues or missing data), the job escalates (`escalate()`) and pauses the automated workflow for manual underwriter review.

### 1.3 Cancellation
Managed by `gw.job.CancellationProcess` and workflows like `CompleteCancellationWF.1.xml`.
*   Cancellations can be initiated by the carrier (e.g., non-payment of premium) or by the insured.
*   The workflow ensures correct calculation of earned/unearned premium and handles any necessary notifications before the terminal state is reached.

### 1.4 Out-of-Sequence (OOS) and Preemptions
When a job is bound with an effective date prior to another in-progress or bound job on the same policy, PolicyCenter detects this as an out-of-sequence transaction. 
*   **Preemption:** A job in progress (e.g., a Renewal) is "preempted" if a PolicyChange is bound with an effective date before the Renewal's start date. The `JobProcess` checks `canHandlePreemptions()` and forces the user/system to handle preemptions before continuing.

## 2. Job Lifecycle and State Management

### Job Entities
All transactions are subtypes of the `Job` entity (`C:\GW10\PolicyCenter\modules\configuration\config\metadata\entity\Job.eti`).
*   **Subtypes:** `Submission`, `Renewal`, `Cancellation`, `PolicyChange`, `Issuance`, `Rewrite`, `Reinstatement`, `Audit`.
*   **Key Fields:** `JobNumber`, `CloseDate`, `SelectedVersion` (points to the chosen `PolicyPeriod`). A Job can have multiple `PolicyPeriod`s (branches) for multi-version quoting.

### State Transitions (PolicyPeriodStatus)
The state is typically tracked on the `PolicyPeriod` (the branch) via `PolicyPeriodStatus`.
*   `New` -> `Draft` -> `Rated` -> `Quoted` -> `Binding` -> `Bound`
*   Other states include `Declined`, `NotTaken`, `Renewing`, `NonRenewing`.
State transition logic is heavily guarded by the `can[Action]()` methods in the `JobProcess` subclasses (e.g., `canEdit()`, `canRequestQuote()`, `canBind()`). These methods return a `JobConditions` object which validates permissions, locked statuses, UI blocking points, and unresolved preemptions.

## 3. Quoting and Validation

### Quote Process
Quoting logic is encapsulated in `gw.job.QuoteProcess`, which decouples rating and quoting from the specific job type.
*   **Two-Step Quoting:** PolicyCenter supports `requestRate()` (calculates premiums without marking the quote as official) followed by `requestPostRatingQuote()`.
*   **Asynchronous Quoting:** Supported via `canRequestAsyncQuote()` and `canRequestAsyncRate()`. 

### Validation
`JobProcessValidator` and `JobProcessUWIssueEvaluator` are invoked at key lifecycle transitions (e.g., `bind()`).
*   **Validation Levels:** Typical validation levels include `Quotable`, `Bindable`, and `ReadyForIssue`.
*   **UWIssue Blocking Points:** `BlocksQuote`, `BlocksBind`, `BlocksIssuance`. If a blocking point is hit, the job is locked until an Underwriter with sufficient authority approves the issue.

## 4. Batch Operations

Background processing and timeouts are orchestrated using PolicyCenter's batch processing engine.
*   **Batch Processes:** Configured via `BatchProcessType` typelist and scheduling XML. Important ones include:
    *   **Workflow:** Advances standard workflow steps.
    *   **PolicyRenewalStart:** Identifies policies coming up for renewal and spawns `Renewal` jobs.
    *   **Geocode:** Resolves addresses to lat/long points.
    *   **Purge:** Cleans up orphaned or closed `Job` entities and their unused `PolicyPeriod` branches (`Job.NextPurgeCheckDate` tracks this).

## Summary of Codebase Locations

*   **Workflow Definitions:** `C:\GW10\PolicyCenter\modules\configuration\config\workflow\` (e.g., `StartRenewalWF.1.xml`)
*   **Job Entities:** `C:\GW10\PolicyCenter\modules\configuration\config\metadata\entity\` (`Job.eti`, `Submission.eti`, `Renewal.eti`)
*   **Job Processes (State Machines):** `C:\GW10\PolicyCenter\modules\configuration\gsrc\gw\job\` (`JobProcess.gs`, `SubmissionProcess.gs`, `RenewalProcess.gs`, `QuoteProcess.gs`)
*   **Rules:** Job and workflow rules exist in `C:\GW10\PolicyCenter\modules\configuration\config\rules\`
*   **Batch Config:** `C:\GW10\PolicyCenter\modules\configuration\config\batchprocess\batch-process-config.xml`
