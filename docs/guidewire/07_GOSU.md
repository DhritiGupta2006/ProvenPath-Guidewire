# Gosu in PolicyCenter

Gosu is the core programming language used in Guidewire PolicyCenter to define business logic, rules, extensions, and plugins. It is an object-oriented language that runs on the JVM and seamlessly integrates with Java and the Guidewire platform.

## Package Organization
The Gosu source files are primarily organized in `C:\GW10\PolicyCenter\modules\configuration\gsrc\`.
Key directories include:
- `gw\`: Main Gosu source containing namespaces like `gw.account`, `gw.policy`, `gw.plugin`, `gw.webservice`, etc.
- `com\`: Additional standard or custom Java/Gosu sources.
- `training\`: Gosu files specifically used for training and learning examples.
- `web\pcf\`: UI logic related to PCFs.
- `wsi\`: Web Service Integration code for both `local` and `remote` implementations.

Plugins are located under `modules\configuration\plugins\`. 
Rules are located in `modules\configuration\config\rules\`.

## Language Structure and Types

### Classes (`.gs`)
Classes encapsulate logic and define objects, services, or plugin implementations. They follow typical object-oriented principles.
Example pattern:
- **Package Declaration**: `package gw.account`
- **Imports**: `uses gw.api.locale.DisplayKey`
- **Annotations**: `@Export` is often used to make the class visible to external systems or throughout the app.
- **Class Definition**: `class AbstractEffDatedMergeableImpl<T extends EffDated> extends AbstractMergeableImpl<T>`
- **Constructors**: Use the `construct()` keyword.
- **Methods**: Use `function` or `override function`.

*Example:* `C:\GW10\PolicyCenter\modules\configuration\gsrc\gw\account\AbstractEffDatedMergeableImpl.gs`

### Enhancements (`.gsx`)
Enhancements are one of the most critical patterns in Guidewire. They allow adding properties and methods to existing entities or types (including Java or generated classes) without modifying the original source or using subclassing.
- Files use the `.gsx` extension.
- Defined as: `enhancement AccountContactEnhancement : entity.AccountContact { ... }`
- They frequently add helper methods (e.g. `getRolesDisplayName()`) or properties (`property get AvailableAccountContactRoleTypes()`) that are then utilized directly in PCF UI screens.

*Example:* `C:\GW10\PolicyCenter\modules\configuration\gsrc\gw\account\AccountContactEnhancement.gsx`

### Rules (`.gr`)
Rules define business logic executed at various lifecycle points (e.g., Validation, Assignment, Event Firing). 
- Found in the `rules\` directory under `modules\configuration\config\`.
- Organized in directories mimicking rule sets (e.g., `Assignment\DefaultGroupAccountAssignmentRules_dir\assignroundrobin.gr`).
- The internal structure of a `.gr` file wraps rule logic in a class with static methods:
  - `doCondition(entity: Entity) : boolean`
  - `doAction(entity: Entity, actions: gw.rules.Action)`
- Code blocks are marked between `/*start00rule*/` and `/*end00rule*/`.
- Inside `doAction`, you often see operations changing state and calls to `actions.exit()`.

*Example:* `C:\GW10\PolicyCenter\modules\configuration\config\rules\Assignment\DefaultGroupAccountAssignmentRules_dir\assignroundrobin.gr`

### Plugins
Plugins define boundaries where PolicyCenter expects logic to connect to external systems or execute specialized calculations (e.g., generating an account number, determining name clearance).
- Implement Gosu interfaces or extend abstract classes.
- E.g., `AccountPlugin` extends `AbstractAccountPlugin`.
- They heavily leverage types, entities, and extensions to manipulate the business objects.

*Example:* `C:\GW10\PolicyCenter\modules\configuration\plugins\Gosu\gclasses\gw\plugin\account\impl\AccountPlugin.gs`

## Integration across the System
Gosu is the glue that integrates the entire Guidewire data and presentation tiers:
1. **Entities**: Gosu manipulates entities directly (`entity.Account`, `entity.Contact`). Enhancements (`.gsx`) extend the generated entity representations seamlessly.
2. **PCFs (UI)**: PCF screens rely entirely on Gosu expressions and Gosu classes/enhancements to display data, perform validation on the fly, and handle button actions.
3. **Rules**: Gosu syntax is used within the rules engine to define dynamic flow, assignments, exceptions, and validation sequences.
4. **Plugins**: System behaviors predefined by Guidewire can be overridden or extended using Gosu code via the plugin registry.

By leveraging enhancements, dependency injection (for plugins), and a strong integration with the Entity datamodel, Gosu keeps the codebase modular and organized according to business domains.
