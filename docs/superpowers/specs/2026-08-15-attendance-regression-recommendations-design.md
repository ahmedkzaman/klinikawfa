# Attendance Regression Recommendations Design

## Goal

Improve the Management Dashboard's attendance recommendations by replacing the simple weekday off-day rule with a regression-based demand estimate. The model must avoid recommending a weekday merely because its average is low when that day contains an important peak hour or substantial uncertainty.

The heatmap remains a descriptive report of observed clinical attendance. Regression is used only for recommendations and forecasting. It never changes rosters, approves leave, closes the clinic, or replaces management judgment.

## Model choice

Use a negative-binomial count regression as the primary model. Clinical arrivals are non-negative counts and can be overdispersed: occasional busy periods can be much larger than the typical value. A negative-binomial model represents this better than ordinary linear regression and is less likely to understate peak risk.

If the fitted dispersion is effectively Poisson, the implementation may use the Poisson limit of the same model. It must not silently fall back to ordinary least squares for count predictions.

## Training observations

One observation represents one Malaysia-local operating date and hour.

Inputs are aggregate and non-identifying:

- Weekday.
- Hour of day, from 08:00 through 23:00.
- Calendar month or seasonality term.
- Sequential week index for recent trend.
- Number of doctors rostered for that hour.
- Optional selected-doctor indicator when a doctor filter is active.
- Whether another doctor is rostered for the selected doctor's comparable operating occurrence.

The response is the number of qualifying clinical arrivals in that operating date-hour. It uses the same clinical-visit definition, Malaysia timezone, exclusions, and roster coverage as the approved attendance heatmap.

Closed and uncovered slots are not zero-demand observations and must not be included in model fitting. Visits recorded outside roster coverage remain visible as data-quality warnings but are not used as ordinary operating observations.

## Data requirements

- Require at least 12 weeks of usable historical data.
- Require at least eight comparable operating dates for a weekday before evaluating it as an off-day candidate.
- Require observations across enough weekdays and hours to fit every included factor without a singular design matrix.
- If these conditions are not met, show `Not enough data for regression recommendation` and retain the descriptive heatmap.
- Bound model input to a maximum of the latest 52 weeks so old clinic behaviour does not dominate current operating patterns.

## Prediction outputs

For each weekday-hour, calculate:

- Expected clinical arrivals.
- Lower and upper prediction bounds.
- Observed average, median, peak, and recent trend for context.
- Average waiting time and number of valid waiting observations.
- Model sample size and model-fit diagnostics.

For each weekday, aggregate the hourly expected values and uncertainty into:

- Predicted daily attendance.
- Predicted daily attendance range.
- Highest expected hourly demand.
- Highest observed hourly peak.
- Peak-risk level.
- Waiting-time risk.
- Other-doctor coverage when a selected doctor is evaluated.

The interface shows predicted values to one decimal place while retaining full precision internally.

## Off-day safety rules

A weekday can be ranked only when all of these conditions are satisfied:

1. It has at least eight comparable operating dates and the overall model has at least 12 usable weeks.
2. Its predicted daily attendance is among the lowest eligible weekdays.
3. Its upper prediction bound is below the configured busy-day threshold.
4. No hour is in the busiest predicted quartile.
5. No hour has an observed peak in the busiest observed-peak quartile.
6. No hour has an upper prediction bound that crosses the busy-hour threshold.
7. Average waiting time does not exceed 45 minutes.
8. Volatility is not high enough to make the low prediction unreliable.
9. For a selected doctor, another doctor has adequate roster coverage on the comparable operating dates.

The predicted and observed peak guards are independent. A low predicted average cannot override a dangerous observed spike, and a historically quiet hour cannot override a high regression uncertainty bound.

If no weekday passes every safety rule, display `No safe off-day recommendation` with the main reasons, such as peak risk, high waiting time, insufficient backup coverage, or insufficient data.

## Ranking and explanation

Eligible weekdays are ranked using a deterministic safety score composed of:

- Predicted daily attendance.
- Upper prediction bound.
- Highest predicted hourly attendance.
- Observed peak percentile.
- Waiting-time risk.
- Volatility.
- Backup-doctor coverage.

The recommended card reads `Possible doctor off-day — <weekday>`. It displays:

- Predicted daily attendance and confidence range.
- Highest-risk hour and its predicted range.
- Observed peak attendance.
- Average waiting time.
- Number of weeks and comparable dates used.
- Backup-doctor coverage when a doctor is selected.
- A concise explanation of why the day ranked safest.

The wording remains advisory. It must never say that a doctor should be off or that the clinic should close.

## Other recommendations

Training-window, peak-staffing, and unstable-period cards continue to use observed heatmap aggregates in the first release. They may display regression forecasts as supporting context, but the regression change must not weaken their existing observed-data safety rules.

## Architecture

The database returns aggregate operating date-hour observations and the descriptive heatmap. No patient-level rows leave the database.

A focused regression module accepts only aggregate observations and returns typed model diagnostics and weekday forecasts. The recommendation module consumes those forecasts plus observed peaks, waiting metrics, and roster coverage. UI components receive a presentation-ready result and do not fit models themselves.

The initial implementation may fit the model in a secure aggregate RPC or a deterministic server-side function. Browser-side fitting is permitted only if the RPC returns aggregate date-hour observations with no patient or visit identifiers and the performance remains bounded. The implementation plan must choose one location and use the same model for tests and production.

## Failure handling

- Singular or non-convergent models produce an unavailable recommendation with a diagnostic reason; they do not produce a guessed weekday.
- Non-finite coefficients, predictions, or bounds invalidate the model result.
- Missing roster coverage, insufficient observations, or excessive dispersion suppress the off-day recommendation.
- A failed regression must not prevent the descriptive heatmap from loading.
- The dashboard refresh retries the regression independently of existing financial and manual dashboard metrics.

## Testing

Verification covers:

- Known synthetic count data with recoverable weekday, hour, trend, and doctor-coverage effects.
- Overdispersed data where negative-binomial predictions remain finite.
- The Poisson-limit case.
- At least 12 weeks and eight-comparable-date requirements.
- Closed/uncovered slots excluded from fitting.
- Low-average weekday with a high observed peak is rejected.
- Low-average weekday with a high prediction bound is rejected.
- Low-average weekday with no backup doctor coverage is rejected for a selected doctor.
- Safe weekday selected when it has low predicted demand, low uncertainty, acceptable waits, and backup coverage.
- Singular/non-convergent input returns unavailable rather than a recommendation.
- No patient-identifying fields in regression inputs or outputs.
- Regression failure does not hide the heatmap.

## Out of scope

- Automatic roster modification, leave approval, or clinic closure.
- Patient-level prediction or profiling.
- Weather, public-holiday, school-calendar, or internet-derived predictors in the first release.
- Machine-learning model selection or automated hyperparameter tuning.
- Using the regression to replace financial, clinical, or waiting-time source records.
