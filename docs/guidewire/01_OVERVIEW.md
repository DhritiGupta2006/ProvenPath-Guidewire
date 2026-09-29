# Guidewire PolicyCenter 10 Architecture Overview

## 1. Introduction
Guidewire PolicyCenter is a core system for property and casualty (P&C) insurers, handling the entire lifecycle of a policy including quoting, issuance, modifications, renewals, and cancellations. This documentation provides an overview of the PolicyCenter 10 codebase.

**Version Information**
- **Project Version**: 10.2.1.1711 (from `project-version.properties`)
- **Gosu Version**: 1.14.26
- **Studio Version**: 6.0.x
- **Platform Version**: 10.201.1

## 2. Core Architecture
PolicyCenter is built on the Guidewire InsuranceSuite platform. It leverages several key technologies:

### Gosu Language
Gosu is the primary programming language for Guidewire applications. The Gosu source code is located in `modules/configuration/gsrc/gw/`. Major packages include:
- `gw.plugin.*`: Plugin implementations.
- `gw.rating.*`: Rating engine logic and algorithms.
- `gw.reinsurance.*`: Reinsurance processing.
- `gw.web.*`: Backing classes for the UI.
- `gw.webservice.*`: SOAP and REST API endpoints.

### Entity Framework
Guidewire uses a proprietary Object-Relational Mapping (ORM) and Entity framework. Entity definitions are located in `modules/configuration/config/metadata/entity/`.
- **`.eti` files**: Define base entities (e.g., `Account.eti`, `Policy.eti`).
- **`.eix` files**: Extensions to base entities (e.g., `Activity.eix`).
- **`.etx` files**: Line-specific extensions (e.g., `PersonalAutoCov.etx` mentioned in `readme.txt`).

### User Interface (PCF)
The UI is built using Page Configuration Format (PCF) files, an XML-based framework. PCF files define the layout, data binding, and navigation of the application. The UI logic is heavily tied to Gosu classes in `gw.web.*`.

### Build System
The project uses **Gradle** as its build system (`build.gradle` and `settings.gradle`), relying on Guidewire-specific plugins (e.g., `com.guidewire.btr.build:gradle-plugins:4.9.100` and `com.guidewire.studio:ij-studio-gradle-plugins:6.2.5`).

## 3. Major Modules and Features

Based on the `config.xml` and `readme.txt` files, several major modules and features are active:

1. **Rating Module**: Enabled (`EnableRatingModule = 2810`). Includes the `IRatingPlugin` implemented by `PCRatingPlugin`.
2. **Reinsurance Module**: Enabled (`EnableReinsuranceModule = 2211`). Handles ceding and risk assessments.
3. **Workers Compensation**: The base application includes WC7 (Workers Compensation basic templated 10.0.0).
4. **Integration**: PolicyCenter is configured to integrate with other Guidewire systems:
   - ClaimCenter URL: `http://localhost:8080/cc`
   - BillingCenter URL: `http://localhost:8580/bc`
5. **Search**: Solr is enabled for free-text search.
6. **Localization**: Enabled for multiple languages including German, Spanish, French, and Japanese.

## 4. Application Flow

A typical request flow in PolicyCenter:
1. **UI Interaction**: A user interacts with a PCF page (e.g., `modules/configuration/config/web/pcf/`).
2. **Web Backing Class**: The PCF page calls Gosu backing classes (in `gsrc/gw/web/`) or directly accesses Entity properties.
3. **Business Logic / Rules**: Gosu rules (e.g., Validation, Pre-update, Assignment) evaluate the action.
4. **Plugins / Integrations**: If the action requires external communication (e.g., Rating, Billing integration), plugins are invoked. Plugins are registered in `.gwp` files in `modules/configuration/config/plugin/registry/` (e.g., `ContactSystemPlugin.gwp`, `BillingMessageTransport.gwp`).
5. **Entity Persistence**: Modifications to Entities are committed to the database via the Entity framework. The environment currently uses an H2 database for local development, though mappings exist for Oracle and SQL Server.

## 5. Plugin Architecture

Plugins provide a bridge between core PolicyCenter logic and custom/external implementations. The registry (`config/plugin/registry/`) maps plugin interfaces to their implementations. Examples include:
- `AccountLocationPlugin`
- `AuthenticationSourceCreatorPlugin`
- `ContactSystemPlugin`
- `DocumentProductionService`

## Conclusion
The PolicyCenter 10 codebase follows a highly structured, metadata-driven architecture. Developers interact primarily with Gosu code, entity configurations, PCF files, and plugin implementations to extend the core P&C capabilities.
