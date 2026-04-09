/**
 * Sample Data Service
 *
 * Generates realistic sample data for onboarding new users.
 * Creates events, meals, and bills for the current week so users
 * can see what a "full" week looks like.
 */

import { eventsApi, financesApi, mealsApi, recipesApi } from '@/api/client';
import { getMonday, getWeekDates } from '@/utils/dateUtils';
import type { EventCreate, FinancialItemCreate, MealPlanCreate, RecipeCreate } from '@/types';

// Sample recipes to create first (meals reference these)
const SAMPLE_RECIPES: RecipeCreate[] = [
  {
    name: 'Scrambled Eggs & Toast',
    instructions: '1. Crack eggs into bowl\n2. Whisk with salt and pepper\n3. Cook in buttered pan\n4. Serve with toast',
    prep_time_minutes: 5,
    cook_time_minutes: 10,
    servings: 2,
  },
  {
    name: 'Chicken Stir Fry',
    instructions: '1. Cut chicken into strips\n2. Stir fry vegetables\n3. Add chicken and sauce\n4. Serve over rice',
    prep_time_minutes: 15,
    cook_time_minutes: 20,
    servings: 4,
  },
  {
    name: 'Caesar Salad',
    instructions: '1. Chop romaine lettuce\n2. Add croutons and parmesan\n3. Toss with Caesar dressing',
    prep_time_minutes: 10,
    cook_time_minutes: 0,
    servings: 2,
  },
  {
    name: 'Spaghetti Bolognese',
    instructions: '1. Brown ground beef\n2. Add tomato sauce and seasonings\n3. Simmer 20 minutes\n4. Serve over pasta',
    prep_time_minutes: 10,
    cook_time_minutes: 30,
    servings: 4,
  },
  {
    name: 'Grilled Cheese Sandwich',
    instructions: '1. Butter bread slices\n2. Add cheese between slices\n3. Grill until golden',
    prep_time_minutes: 2,
    cook_time_minutes: 5,
    servings: 1,
  },
];

// Generate events relative to current week
function generateSampleEvents(weekDates: string[]): EventCreate[] {
  const [mon, tue, wed, thu, fri, sat, sun] = weekDates;

  return [
    // Monday
    { name: 'Team standup', date: mon, start_time: '09:00', end_time: '09:30', location: 'Office' },
    { name: 'Dentist appointment', date: mon, start_time: '14:00', end_time: '15:00', location: 'Downtown Dental' },

    // Tuesday
    { name: 'Project review', date: tue, start_time: '10:00', end_time: '11:30', location: 'Conference Room A' },
    { name: 'Gym session', date: tue, start_time: '18:00', end_time: '19:00', location: 'FitLife Gym' },

    // Wednesday
    { name: 'Lunch with Sarah', date: wed, start_time: '12:00', end_time: '13:00', location: 'Corner Cafe' },

    // Thursday
    { name: 'Client call', date: thu, start_time: '15:00', end_time: '16:00', description: 'Q1 review with Acme Corp' },
    { name: 'Yoga class', date: thu, start_time: '19:00', end_time: '20:00', location: 'Zen Studio' },

    // Friday
    { name: 'Weekly planning', date: fri, start_time: '09:00', end_time: '10:00' },
    { name: 'Happy hour', date: fri, start_time: '17:30', end_time: '19:00', location: "O'Malley's Pub" },

    // Saturday
    { name: 'Farmers market', date: sat, start_time: '09:00', end_time: '11:00', location: 'Downtown Square' },
    { name: 'Movie night', date: sat, start_time: '19:00', end_time: '22:00', location: 'Home' },

    // Sunday
    { name: 'Brunch with family', date: sun, start_time: '11:00', end_time: '13:00', location: "Mom's house" },
  ];
}

// Generate bills relative to current week
function generateSampleBills(weekDates: string[]): FinancialItemCreate[] {
  const [mon, , wed, , fri] = weekDates;

  return [
    { name: 'Electric bill', amount: 85.50, due_date: mon, type: 'bill' },
    { name: 'Internet', amount: 65.00, due_date: wed, type: 'bill' },
    { name: 'Phone bill', amount: 45.00, due_date: fri, type: 'bill' },
    { name: 'Streaming subscription', amount: 15.99, due_date: fri, type: 'bill' },
  ];
}

// Generate meal plan (references recipe IDs after creation)
function generateSampleMeals(weekDates: string[], recipeIds: number[]): MealPlanCreate[] {
  const meals: MealPlanCreate[] = [];
  const [scrambledEggsId, stirFryId, saladId, spaghettiId, grilledCheeseId] = recipeIds;

  // Plan meals for each day
  weekDates.forEach((date, dayIndex) => {
    // Breakfast - some days have scrambled eggs
    if (dayIndex % 2 === 0) {
      meals.push({ date, meal_type: 'breakfast', recipe_id: scrambledEggsId });
    } else {
      meals.push({ date, meal_type: 'breakfast', description: 'Cereal and fruit' });
    }

    // Lunch - mix of recipes and descriptions
    if (dayIndex === 0 || dayIndex === 3) {
      meals.push({ date, meal_type: 'lunch', recipe_id: saladId });
    } else if (dayIndex === 2 || dayIndex === 5) {
      meals.push({ date, meal_type: 'lunch', recipe_id: grilledCheeseId });
    }
    // Some days have no lunch planned - that's realistic!

    // Dinner - most days have something
    if (dayIndex === 0) {
      meals.push({ date, meal_type: 'dinner', recipe_id: spaghettiId });
    } else if (dayIndex === 1 || dayIndex === 4) {
      meals.push({ date, meal_type: 'dinner', recipe_id: stirFryId });
    } else if (dayIndex === 3) {
      meals.push({ date, meal_type: 'dinner', description: 'Takeout pizza' });
    } else if (dayIndex === 5) {
      meals.push({ date, meal_type: 'dinner', description: 'Grilling outside' });
    }
    // Sunday dinner intentionally left unplanned
  });

  return meals;
}

/**
 * Load sample data for onboarding
 * Creates recipes, events, bills, and meal plans for the current week
 */
export async function loadSampleData(): Promise<{ success: boolean; message: string }> {
  try {
    const weekStart = getMonday();
    const weekDates = getWeekDates(weekStart);

    // 1. Create sample recipes first
    const createdRecipes = await Promise.all(
      SAMPLE_RECIPES.map((recipe) => recipesApi.create(recipe))
    );
    const recipeIds = createdRecipes.map((r) => r.id);

    // 2. Create events
    const events = generateSampleEvents(weekDates);
    await Promise.all(events.map((event) => eventsApi.create(event)));

    // 3. Create bills
    const bills = generateSampleBills(weekDates);
    await Promise.all(bills.map((bill) => financesApi.create(bill)));

    // 4. Create meal plan
    const meals = generateSampleMeals(weekDates, recipeIds);
    await Promise.all(meals.map((meal) => mealsApi.create(meal)));

    return {
      success: true,
      message: `Created ${events.length} events, ${bills.length} bills, ${createdRecipes.length} recipes, and ${meals.length} meal entries`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
