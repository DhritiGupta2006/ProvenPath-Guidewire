# PolicyCenter Product Model Analysis

This document details how the Guidewire PolicyCenter product model is designed and represented in the codebase.

## 1. How Product Configuration is Represented

The Product Model in Guidewire PolicyCenter is primarily driven by XML configurations that act as metadata, which the system uses to generate the underlying Java/Gosu classes representing the insurance products.

### XML Configurations
The core product model definitions reside in:
C:\GW10\PolicyCenter\modules\configuration\config\resources\productmodel\

This directory contains key folders:
*   products/: Contains XML files defining top-level products (e.g., PersonalAuto, CommercialProperty).
*   policylinepatterns/: Contains XML files defining policy lines (e.g., PersonalAutoLine, BOPLine). Inside these line patterns are subdirectories for coveragepatterns (coverages, exclusions, conditions).
*   uditschedules/: Contains definitions for premium audit schedules.

### Generated Code
During the build process, PolicyCenter reads the XML configuration and generates strong-typed Gosu/Java classes. These generated artifacts are located in:
C:\GW10\PolicyCenter\modules\configuration\generated\productmodel\

These classes (e.g., coveragepatterns.PAComprehensiveCov.java) provide a programmatic API (properties and methods) that the core application and Gosu rules use to interact with the product definitions safely.

## 2. Products and Product Lines

### Products
Products are defined in XML files within esources\productmodel\products\<ProductName>\.
For example, products\PersonalAuto\PersonalAuto.xml defines the Personal Auto product. 
*   It specifies properties like productType="Personal", defaultTermType="HalfYear", and daysUntilQuoteNeeded="7".
*   It links to available policy terms, document templates, and the policy lines it includes.

### Product Lines (Policy Line Patterns)
A product consists of one or more Policy Lines. These are defined in esources\productmodel\policylinepatterns\<LineName>\.
For example, policylinepatterns\PersonalAutoLine\PersonalAutoLine.xml defines the Personal Auto line.
*   It specifies CoverageCategories (grouping coverages logically, e.g., PAPPhysDamGrp, PAPLiabGrp).
*   It contains references to modifier patterns (e.g., discounts).
*   It defines the existence of coverages across the line.

## 3. Coverages, Exclusions, Limits, and Deductibles

Within each policy line, specific coverages, exclusions, and conditions (collectively called "clauses") are defined under the coveragepatterns directory (e.g., policylinepatterns\PersonalAutoLine\coveragepatterns\).

### Coverages
A coverage is defined in its own XML file. For example, PAComprehensiveCov.xml represents the Comprehensive Coverage for Personal Auto:
*   It specifies the coverageCategory (e.g., PAPPhysDamGrp).
*   It defines the owningEntityType (e.g., PersonalVehicle) meaning this coverage attaches to a vehicle.
*   It sets existence="Suggested", dictating whether the coverage is automatically added or just available.

### Terms (Limits and Deductibles)
Inside a coverage XML, <CovTerms> define the configurable values for that coverage, such as limits and deductibles.
For example, in PAComprehensiveCov.xml, we find an <OptionCovTermPattern>:
*   codeIdentifier="PACompDeductible"
*   modelType="Deductible"
*   alueType="money"
*   It references a lookup table (PAVehicleCovOpt) to determine available deductible choices.

Other term types include <GenericCovTermPattern> (for string/boolean values) and <PackageCovTermPattern> (for paired limits like 100k/300k).

## 4. Availability and Eligibility Rules

Availability dictates whether a product, coverage, or term is allowed for a given state, date, or other criteria. 

### Lookup Tables
The core availability matrix is defined using lookup tables, located at:
C:\GW10\PolicyCenter\modules\configuration\config\lookuptables\lookuptables.xml

This file defines the dimensions for various lookups. For example, the ProductLookup table evaluates dimensions like:
*   State (precedence 0)
*   JobType (precedence 1)
*   IndustryCode (precedence 2)

These lookups are resolved against CSV files or XML lookup definition files (like PersonalAuto-lookups.xml and PAComprehensiveCov-lookups.xml) to determine if a specific product or coverage is available in a specific jurisdiction on a specific date.

### Gosu Scripts
Availability can also be driven by scripts. Inside the coverage pattern XMLs (e.g., PAComprehensiveCov.xml), there are <AvailabilityScript> nodes. These Gosu scripts allow for complex, dynamic eligibility logic that cannot be simply represented in a lookup table (e.g., "Coverage A is only available if the vehicle is newer than 10 years and Coverage B is not selected").
