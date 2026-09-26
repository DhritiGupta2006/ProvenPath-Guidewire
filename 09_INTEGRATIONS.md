# PolicyCenter Integration Architecture

This document outlines the integration points, messaging framework, and APIs available in the Guidewire PolicyCenter codebase located at `C:\GW10\PolicyCenter`.

## REST and SOAP APIs

PolicyCenter supports both modern RESTful APIs and legacy SOAP web services for inbound and outbound communication.

### REST APIs
REST API definitions and schemas are located in `C:\GW10\PolicyCenter\modules\configuration\config\integration\apis\`. The framework relies on Swagger YAML files to define API contracts and JSON schemas to define payloads.
* **System/Framework APIs**: Found in `integration\apis\gw\pl\framework\` (e.g., `api_list-1.0.swagger.yaml`, `metadata-1.0.swagger.yaml`) and `integration\apis\gw\pl\system\` (e.g., `cluster_tools-1.0.swagger.yaml`, `messaging_tools-0.1.swagger.yaml`).
* **BizRules API**: `integration\apis\gw\bizrules\bizrules-1.0.swagger.yaml`.

### SOAP Web Services
SOAP endpoint implementations are written in Gosu and located in `C:\GW10\PolicyCenter\modules\configuration\gsrc\gw\webservice\`. Some of the core web services include:
* **Job APIs**: `pc\pc900\job\JobAPI.gs`, `SubmissionAPI.gs`, `PolicyChangeAPI.gs`, `CancellationAPI.gs`.
* **Policy APIs**: `pc\pc900\policy\PolicyAPI.gs`, `PolicyPeriodAPI.gs`, `ImportPolicyAPI.gs`.
* **Product Model APIs**: `pc\pc900\productmodel\ProductModelAPI.gs` - used for querying product structure, lookups, and types.
* **Community APIs**: `pc\pc900\community\ProducerAPI.gs`.

## Plugin Architecture

Plugins allow custom behavior to be injected into core PolicyCenter processes. The plugin registry is located in `C:\GW10\PolicyCenter\modules\configuration\config\plugin\registry\`, where each plugin has a `.gwp` file defining the Gosu or Java class that implements the required interface.

Key plugins include:
* `IPolicyPlugin.gwp`, `IPolicyPeriodPlugin.gwp`, `IPolicyTermPlugin.gwp` - Core policy processing extensions.
* `IRatingPlugin.gwp` - Integration with rating engines.
* `PaymentGatewayPlugin.gwp` - Processing payments.
* `IValidationPlugin.gwp` - Custom validation logic.
* `IPreUpdateHandler.gwp` - Execution logic right before database commit.
* `IPDFMergeHandler.gwp` - PDF document manipulation.

## Messaging Framework

The messaging framework enables asynchronous outbound integrations. Configuration is defined in `C:\GW10\PolicyCenter\modules\configuration\config\messaging\messaging-config.xml`.

Key Messaging Destinations:
* **Destination 65 (Email)**: Asynchronous email delivery.
* **Destination 66 (BillingSystem)**: Outbound integration with BillingCenter, listening to all events `(\w)*`.
* **Destination 67 (ContactMessageTransport)**: Sends contact updates (`ContactAdded`, `ContactChanged`, `ContactRemoved`).
* **Destination 69 (SolrMessageTransport)**: Updates the Solr search index when policy periods or contacts are modified.
* **Destination 70 (SmartCommsDocumentProduction)**: Document generation triggered by `GenerateDocument`.
* **Destination 322 (FederatedDataService)**: Emits comprehensive data updates across all core entities (Accounts, Jobs, Policies) to external data consumers.

## External Integrations

* **ClaimCenter Integration (ccintegration)**: Located in `C:\GW10\PolicyCenter\modules\configuration\gsrc\gw\webservice\pc\pc900\ccintegration\`. Includes `CCPolicySearchIntegration.gs` and various Line of Business mappers (e.g., `CCBOPPolicyLineMapper.gs`) which ClaimCenter calls to verify coverage details on claims.
* **Billing Integration**: Facilitated through the messaging destination ID 66 and matching plugin `BillingMessageTransport`.
* **Document Management**: Handled via `SmartCommsDocumentProduction` (Destination 70) and `DocumentStore` (Destination 324) for archival.

## Extension Points Relevant to ProvenPath

For ProvenPath—a pre-commit compliance gate for agentic insurance product configuration—the following integration points are most relevant:

1. **`IPreUpdateHandler.gwp`**: This plugin executes right before an entity bundle is committed to the database. ProvenPath can implement or hook into this handler to inspect all modified entities, evaluate compliance rules, and abort the transaction (throw an exception) if compliance gates fail.
2. **`IValidationPlugin.gwp`**: Allows custom validation routines at the application level. Can be invoked during the validation phases of policy jobs, ensuring the product model configurations satisfy ProvenPath's structural requirements before quoting or binding.
3. **Product Model Web Services (`ProductModelAPI.gs`)**: Can be used by ProvenPath's external agents to query and validate the current product model definitions and metadata prior to initiating modifications.
