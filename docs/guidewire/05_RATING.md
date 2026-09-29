# PolicyCenter Rating Engine and Configuration

This document covers the rating architecture, configuration of rate books and routines, and premium calculation in Guidewire PolicyCenter.

## 1. Rating Architecture

PolicyCenter's rating architecture separates the mathematical logic (configured in the UI via Rate Routines and Tables) from the lifecycle execution (managed by Gosu).

### Gosu Rating Engine
The entry point for rating is typically a line-specific subclass of [AbstractRatingEngine.gs](file:///C:/GW10/PolicyCenter/modules/configuration/gsrc/gw/rating/AbstractRatingEngine.gs). The rating process occurs in four phases:
1. **Rate Slices**: The policy period is divided into effective-dated "slices" (intervals where no policy data changes). The engine calculates "slice mode" costs for each slice independently (e.g., base coverages).
2. **Merge and Prorate**: Because slice rating creates fragmented costs, the engine merges identical adjacent costs (costs with the same `CostDataKey`). "Rate-scalable" costs are prorated by time, while "basis-scalable" costs are summed. 
3. **Rate Window Costs**: Costs that depend on the sum of previous costs or span the whole period (e.g., taxes, multi-policy discounts, cancellation penalties) are rated in "window" mode across the entire period.
4. **Persist Costs**: The engine converts the transient in-memory objects to actual database entities.

### CostData
Rating heavily utilizes [CostData.gs](file:///C:/GW10/PolicyCenter/modules/configuration/gsrc/gw/rating/CostData.gs) classes instead of `Cost` entities. `CostData` provides a flexible way to build the rating graph and apply modifications before committing to the database. Key properties include:
- `ActualAmount` / `ActualTermAmount`
- `StandardAmount` / `StandardTermAmount`
- `ActualBaseRate` / `ActualAdjRate`
- Overrides (`OverrideAmount`, `OverrideBaseRate`, `OverrideReason`)
- Currency conversion mappings (`ActualAmountBilling`, etc.)

## 2. Rate Books and Rate Table Definitions

Rating data is modular and version-controlled using Rate Books.

- **RateBook**: ([RateBook.eti](file:///C:/GW10/PolicyCenter/modules/configuration/config/metadata/entity/RateBook.eti)) A versioned collection of rate tables and routines. Contains attributes like `BookCode`, `BookEdition`, `Status` (Draft, Active, Approved), and effective dates (`EffectiveDate`, `ExpirationDate`). 
- **RateTableDefinition**: ([RateTableDefinition.eti](file:///C:/GW10/PolicyCenter/modules/configuration/config/metadata/entity/RateTableDefinition.eti)) Defines the logical structure of a table. It specifies the parameters (`RateTableArgumentSourceSet`), the match operations (`RateTableMatchOp`), and the factors/columns (`RateTableColumn`).
- **RateTable**: ([RateTable.eti](file:///C:/GW10/PolicyCenter/modules/configuration/config/metadata/entity/RateTable.eti)) Binds a `RateTableDefinition` to a specific `RateBook` instance.
- **DefaultRateFactorRow**: ([DefaultRateFactorRow.eti](file:///C:/GW10/PolicyCenter/modules/configuration/config/metadata/entity/DefaultRateFactorRow.eti)) The default physical table used to store the rate factors. It has generic columns (`str1` to `str8`, `int1` to `int8`, `dec1` to `dec6`, `date1`, `date2`) that are dynamically mapped to the logical columns defined in the `RateTableDefinition`.

## 3. Rating Rules and Rate Routines

In modern PolicyCenter implementations, rating logic is typically not hardcoded in Gosu rules but configured dynamically.

### Rate Routines
A **Rate Routine** ([CalcRoutineDefinition.eti](file:///C:/GW10/PolicyCenter/modules/configuration/config/metadata/entity/CalcRoutineDefinition.eti)) defines the mathematical steps to calculate a premium. 
- Routines consist of an ordered list of **Steps** (`CalcStepDefinition`).
- Steps can perform arithmetic, look up factors in Rate Tables, define local variables, or branch conditionally.
- They are linked to `RateBook`s via the `RateBookCalcRoutine` join entity.
- If a calculation fails or requires explanation, PolicyCenter generates **Rating Worksheets** (`gw.rating.worksheet.*`) which display the step-by-step math to the underwriter.

### Legacy / System Tables
While the UI-driven Rating Management engine is standard, some legacy or static lookups are still defined as system tables (found in `C:\GW10\PolicyCenter\modules\configuration\config\resources\systables\`). Examples include:
- `short_ratefactors.xml`: Contains short-rate cancellation penalty factors.
- `rates_general_liability.xml`: Contains hardcoded base rates and minimum premiums for GL class codes.

## 4. Premium Calculation and Proration

Premiums are derived from the `ActualTermAmount` (the cost if the coverage was active for the full term) and prorated to the `ActualAmount` (the cost for the specific days it was active).

- **Proration**: Proration relies on `gw.financials.Prorater` and is governed by `ProrationMethod` (e.g., `TC_PRORATABYDAYS`). `CostData.updateAmountFields()` calculates the prorated `ActualAmount` based on `NumDaysInRatedTerm`.
- **Overrides**: Underwriters can manually override premiums. The `CostData` captures these as `OverrideAmount`, `OverrideBaseRate`, etc., and uses the `OverrideReason` for auditing. The rating engine respects overrides when regenerating costs.
- **Multi-Currency**: For global implementations, `CostData` utilizes `PolicyFXRate` to automatically compute Billing amounts (`ActualAmountBilling`) from the rated Coverage currency.
