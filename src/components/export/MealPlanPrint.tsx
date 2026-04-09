/**
 * MealPlanPrint — Printable 7-day x 3-meal grid.
 *
 * Shows recipe names, servings, and key ingredients for each meal slot.
 */

import { forwardRef } from 'react';
import { PrintLayout } from './PrintLayout';
import type { MealPlanEntry, Recipe } from '@/types';
import { getDayName, getDayOfMonth, getWeekDates } from '@/utils/dateUtils';

interface MealPlanPrintProps {
  weekStart: string;
  meals: MealPlanEntry[];
  recipes: Recipe[];
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;

export const MealPlanPrint = forwardRef<HTMLDivElement, MealPlanPrintProps>(
  function MealPlanPrint({ weekStart, meals, recipes }, ref) {
    const weekDates = getWeekDates(weekStart);
    const recipeMap = new Map<number, Recipe>();
    recipes.forEach((r) => recipeMap.set(r.id, r));

    const weekEnd = weekDates[weekDates.length - 1];
    const dateRange = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

    return (
      <PrintLayout ref={ref} title="Meal Plan" dateRange={dateRange}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-300 w-24">
                Day
              </th>
              {MEAL_TYPES.map((type) => (
                <th
                  key={type}
                  className="p-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-300"
                >
                  {type}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekDates.map((date) => (
              <tr key={date} className="border-b border-gray-200">
                <td className="p-2 font-medium text-gray-800 text-sm align-top">
                  <div>{getDayName(date, 'short')}</div>
                  <div className="text-xs text-gray-400">{getDayOfMonth(date)}</div>
                </td>
                {MEAL_TYPES.map((type) => {
                  const meal = meals.find(
                    (m) => m.date === date && m.meal_type === type
                  );
                  const recipe = meal?.recipe_id
                    ? recipeMap.get(meal.recipe_id)
                    : null;

                  return (
                    <td key={type} className="p-2 align-top">
                      {recipe ? (
                        <div>
                          <p className="font-medium text-gray-800 text-sm">
                            {recipe.name}
                          </p>
                          {meal?.planned_servings && (
                            <p className="text-xs text-gray-500">
                              {meal.planned_servings} servings
                            </p>
                          )}
                        </div>
                      ) : meal?.description ? (
                        <p className="text-sm text-gray-600 italic">
                          {meal.description}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-300">-</p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </PrintLayout>
    );
  }
);

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year}`;
}
