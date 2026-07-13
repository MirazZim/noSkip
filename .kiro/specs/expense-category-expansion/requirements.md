# Requirements Document

## Introduction

This document specifies requirements for expanding the expense tracking category system to provide more comprehensive coverage of daily expenditures. The expansion focuses on three areas: (1) separating grooming services from general shopping into a dedicated parent category with specialized subcategories, (2) enhancing Food & Drinks with meal-type subcategories, and (3) expanding Entertainment with sports and physical activity options. Additionally, a comprehensive gap analysis identifies missing common expense categories to ensure thorough coverage of typical day-to-day spending patterns.

## Glossary

- **Category_System**: The hierarchical expense categorization structure consisting of parent categories and subcategories
- **Parent_Category**: Top-level expense classification with associated color, emoji, and label
- **Subcategory**: Second-level expense classification nested within a parent category
- **Grooming_Services**: Personal care services including spa, salon, manicure, pedicure, and hair treatments
- **Meal_Type_Subcategory**: Food & Drinks subcategory organized by meal timing (breakfast, lunch, dinner, snacks)
- **Sports_Activities**: Physical recreational activities including turf play, court rentals, and equipment usage
- **Gap_Analysis**: Systematic review comparing current categories against common day-to-day expense patterns
- **Category_Migration**: Process of moving existing expenses from one category to another during restructuring

## Requirements

### Requirement 1: Grooming Parent Category

**User Story:** As a user tracking personal expenses, I want grooming services in a dedicated parent category, so that I can accurately track beauty and personal care service spending separate from shopping purchases.

#### Acceptance Criteria

1. THE Category_System SHALL include a new parent category named "Grooming" with a unique color, emoji, and label
2. THE Grooming parent category SHALL contain subcategories for: Spa, Salon, Manicure, Pedicure, Hair Treatment, and General Grooming
3. WHEN the Grooming parent category is created, THE Category_System SHALL assign it a unique identifier following the existing naming convention
4. THE Grooming parent category SHALL appear in all category selection interfaces alongside existing parent categories
5. THE Shopping parent category SHALL no longer include "Personal Care / Grooming" as a subcategory after the Grooming parent category is introduced

### Requirement 2: Food & Drinks Meal Type Expansion

**User Story:** As a user tracking food expenses, I want to categorize food by meal type, so that I can analyze my spending patterns across breakfast, lunch, and dinner.

#### Acceptance Criteria

1. THE Food_&_Drinks parent category SHALL include meal-type subcategories: Breakfast, Lunch, Dinner, and Snacks
2. THE existing Food & Drinks subcategories (Groceries, Dining Out, Street Food, Coffee/Tea, Meal Delivery, Drinks) SHALL remain available alongside the new meal-type subcategories
3. WHEN a user selects a meal-type subcategory, THE Category_System SHALL associate the expense with the Food & Drinks parent category
4. THE meal-type subcategories SHALL each have unique identifiers, labels, and emojis following the existing subcategory pattern

### Requirement 3: Entertainment Sports Activities Expansion

**User Story:** As a user with active hobbies, I want to track sports and physical activity expenses, so that I can monitor spending on recreational sports like playing at the turf.

#### Acceptance Criteria

1. THE Entertainment parent category SHALL include sports-related subcategories: Turf Booking, Court Rental, Sports Equipment, Sports Activities, and Gym Day Pass
2. THE existing Entertainment subcategories (Streaming Services, Subscriptions, Games, Events/Outings, Hobbies) SHALL remain available alongside the new sports subcategories
3. WHEN a user selects a sports subcategory, THE Category_System SHALL associate the expense with the Entertainment parent category
4. THE sports subcategories SHALL each have unique identifiers (turf-booking, court-rental, sports-equipment, sports-activities, gym-day-pass), labels, and emojis following the existing subcategory pattern
5. THE "Turf Booking" subcategory SHALL be used specifically for fees paid to play at turf facilities (football turf, cricket turf, etc.)

### Requirement 4: Gap Analysis for Common Expense Categories

**User Story:** As a product designer, I want to identify missing common day-to-day expense categories, so that the system comprehensively covers typical user spending patterns.

#### Acceptance Criteria

1. THE Gap_Analysis SHALL review the following expense domains: Pets, Children, Travel, Professional Services, Legal, Home Improvement, Seasonal, Emergencies, and Subscriptions
2. FOR EACH reviewed domain, THE Gap_Analysis SHALL determine if current categories adequately cover that domain or if new categories are needed
3. THE Gap_Analysis SHALL document findings with justification for each recommendation (add, modify, or keep as-is)
4. THE Gap_Analysis SHALL prioritize recommendations based on frequency of use in typical household budgets
5. WHERE a new parent category is recommended, THE Gap_Analysis SHALL specify suggested subcategories with labels and appropriate emojis

### Requirement 5: Category Structure Consistency

**User Story:** As a developer maintaining the expense system, I want all category changes to follow existing structural patterns, so that the codebase remains consistent and maintainable.

#### Acceptance Criteria

1. THE Category_System SHALL maintain the existing data structure: ParentCategory with id, label, color, emoji, and subcategories array
2. WHEN new subcategories are added, THE Category_System SHALL follow the existing SubCategory structure with id, label, and emoji fields
3. THE Category_System SHALL use kebab-case for all category and subcategory identifiers
4. WHEN new parent categories are created, THE Category_System SHALL assign HSL color values consistent with the existing color palette pattern
5. THE Category_System SHALL ensure no duplicate category or subcategory identifiers exist across the entire structure

### Requirement 6: Backward Compatibility

**User Story:** As a user with existing expense records, I want the category expansion to preserve my historical data, so that my past expenses remain accessible and accurate.

#### Acceptance Criteria

1. WHEN the Shopping category structure changes, THE Category_System SHALL maintain the existing "personal-care" subcategory identifier for historical data compatibility
2. THE Category_System SHALL support both old and new category values when reading historical expense data
3. WHEN displaying historical expenses with deprecated categories, THE Category_System SHALL render them with appropriate fallback labels
4. THE Category_System SHALL NOT require migration of existing expense records to new category values
5. WHERE a category mapping function is used, THE Category_System SHALL handle both legacy and current category value formats

### Requirement 7: User Interface Integration

**User Story:** As a user entering expenses, I want new categories to appear in all relevant interfaces, so that I can immediately use them for expense tracking.

#### Acceptance Criteria

1. WHEN the Category_System is updated, THE expense entry dialog SHALL display all new parent categories and subcategories
2. WHEN the Category_System is updated, THE budget manager interface SHALL include all new categories for budget allocation
3. WHEN the Category_System is updated, THE expense charts and reports SHALL include all new categories in visualizations
4. THE category selection interface SHALL order parent categories in a logical sequence with Grooming placed near Shopping and Health
5. THE category selection interface SHALL display subcategories grouped under their parent categories with appropriate visual hierarchy

### Requirement 8: Gap Analysis Recommendations Implementation

**User Story:** As a user tracking diverse expenses, I want the system to include commonly needed categories identified in the gap analysis, so that I can accurately categorize all my spending.

#### Acceptance Criteria

1. WHERE the Gap_Analysis identifies a high-priority missing category, THE Category_System SHALL include that category in the expansion
2. THE Category_System SHALL include parent categories for: Pets (with subcategories for veterinary, food, grooming, supplies), Children (with subcategories for childcare, education, activities, supplies), and Travel (with subcategories for accommodation, transportation, activities, meals)
3. THE Category_System SHALL include subcategories under appropriate existing parents for: professional services (under Business or Finance), home improvement (under Housing), and emergency expenses (under Other or Finance)
4. WHERE a recommended category overlaps with existing categories, THE Category_System SHALL extend the existing category rather than create duplicates
5. THE Category_System SHALL provide descriptive labels and culturally appropriate emojis for all new categories added from gap analysis recommendations

