// Returns the meal type that makes sense for a given hour of day (0-23).
// Gaps between windows (4–5 pm, 10 pm–5 am) default to snack.
export function getMealTypeForHour(hour) {
  if (hour >= 5  && hour < 11) return 'breakfast';  // 5 am – 11 am
  if (hour >= 11 && hour < 16) return 'lunch';       // 11 am – 4 pm
  if (hour >= 17 && hour < 22) return 'dinner';      // 5 pm – 10 pm
  return 'snack';
}

// Returns the meal type that makes sense for the current time of day.
export function getDefaultMealType() {
  return getMealTypeForHour(new Date().getHours());
}
