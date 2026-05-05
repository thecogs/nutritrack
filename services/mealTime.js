// Returns the meal type that makes sense for the current time of day.
// Gaps between windows (4–5 pm, 10 pm–5 am) default to snack.
export function getDefaultMealType() {
  const hour = new Date().getHours();
  if (hour >= 5  && hour < 11) return 'breakfast';  // 5 am – 11 am
  if (hour >= 11 && hour < 16) return 'lunch';       // 11 am – 4 pm
  if (hour >= 17 && hour < 22) return 'dinner';      // 5 pm – 10 pm
  return 'snack';
}
