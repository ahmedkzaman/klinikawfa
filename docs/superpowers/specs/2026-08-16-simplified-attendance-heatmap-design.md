# Simplified Patient Attendance Heatmap Design

## Goal

Make the Management Dashboard attendance section easy to scan for three management decisions:

1. Which weekday may be suitable for a doctor's off-day.
2. Which period may be suitable for staff training.
3. Which period is likely to need the most staffing.

The simplified presentation must use the existing attendance regression and safety-veto analysis. It changes presentation and aggregation only; it does not weaken the model, alter visit data, or automate roster changes.

## Default presentation

Show three decision cards before the heatmap:

- **Possible doctor off-day**: the safest regression-qualified weekday, or a clear `No safe off-day recommendation` state.
- **Best training window**: the lowest regression-predicted safe period that passes the existing waiting-time, uncertainty, observed-peak, roster-coverage, and sample-size checks.
- **Peak staffing period**: the highest regression-predicted period, with the weekday and expected demand.

Each card shows only the decision, predicted attendance, prediction range, confidence level, and one concise reason. Clicking a card opens its detailed evidence.

## Four-period heatmap

Replace the default 16-hour matrix with a 7-weekday by 4-period matrix:

| Period | Time |
|---|---|
| Morning | 08:00–12:00 |
| Afternoon | 12:00–16:00 |
| Evening | 16:00–20:00 |
| Night | 20:00–00:00 |

Every period contains four complete hourly observations. Every period cell is calculated from the same hourly regression outputs used for recommendations. The cell displays the summed predicted attendance for that weekday-period and uses a simple Low, Moderate, or High colour scale. Closed, uncovered, insufficient-data, and warning states remain distinguishable.

Clicking a period cell opens the existing detailed panel with its hourly predictions, observed averages and peaks, waiting-time evidence, roster coverage, prediction bounds, and safety warnings.

## Regression and aggregation rules

- Fit the regression exactly once for the selected date range and doctor filter.
- Preserve all existing model eligibility, identifiability, uncertainty, peak-risk, waiting-time, and backup-coverage checks.
- Aggregate expected hourly visits by summing the hourly predictions within each of the four periods.
- Aggregate lower and upper bounds conservatively by summing their hourly bounds.
- A period is eligible for a training recommendation only if every included operating hour passes the applicable safety checks.
- Peak staffing uses the period with the highest summed expected attendance, not merely the single busiest hour.
- Doctor off-day selection continues to use the full weekday regression and every-hour safety vetoes; the compact period view must not change that decision.
- Historical observations remain supporting evidence in details, while the default cards, period values, rankings, and recommendations are regression-driven.

## Progressive disclosure

Keep the existing date-range and doctor filters visible. Move the following under a collapsed `View detailed analysis` control:

- The full 16-hour heatmap.
- Model diagnostics and usable-week counts.
- Complete safety checks by weekday.
- Unstable-period details.
- Full observed-versus-predicted evidence.

The collapsed section must not refetch or refit the model. It reuses the same loaded report and regression result.

## Confidence display

Translate model evidence into a compact label:

- **High confidence**: sufficient history, stable prediction, complete coverage, and narrow uncertainty.
- **Moderate confidence**: recommendation remains safe but uncertainty or sample depth is less strong.
- **Insufficient data**: the model cannot support a recommendation.

Confidence labels are explanatory and must not override any safety veto.

## Failure and empty states

- If regression is unavailable, keep the observed attendance view accessible and state that recommendations cannot be calculated.
- If no period passes training safety checks, show `No safe training window` rather than selecting the lowest unsafe period.
- If no weekday passes the off-day checks, show `No safe off-day recommendation`.
- If roster coverage is missing, preserve the uncovered state and exclude it from regression-driven recommendations.
- An individual card failure must not hide the other cards or the descriptive data.

## Accessibility and responsive behaviour

- The 7-by-4 matrix must fit desktop width without horizontal scrolling at the Management Dashboard's normal content width.
- On narrow screens, weekday rows may stack, but period names and values must remain readable.
- Colour is never the only signal; every cell includes its Low, Moderate, High, or unavailable label.
- Cards and cells are keyboard accessible and have descriptive accessible names.

## Testing

Add coverage for:

- Exact period boundaries: 08:00–12:00, 12:00–16:00, 16:00–20:00, and 20:00–00:00.
- Period totals and prediction bounds derived from hourly regression forecasts.
- All three decision cards using regression output rather than raw averages.
- Training windows rejected when any included hour fails a safety rule.
- Peak staffing selected from period totals.
- Off-day results unchanged by the compact aggregation.
- Detailed hourly analysis opening from cards and period cells.
- Regression-unavailable, insufficient-data, uncovered, and no-safe-candidate states.
- Keyboard access and compact responsive rendering.

## Out of scope

- Changing the attendance RPC or clinical-visit definition.
- Changing the regression family or approved safety thresholds.
- Automatically editing doctor rosters, leave, training schedules, or clinic hours.
- Adding internet, weather, holiday, or school-calendar predictors.
