interface RecordedDiagnosisInput {
  structuredDiagnosis?: string | null;
  diagnosisText?: string | null;
}

export function getRecordedDiagnosisLabels({
  structuredDiagnosis,
  diagnosisText,
}: RecordedDiagnosisInput): string[] {
  const candidates = [
    structuredDiagnosis?.trim() ?? '',
    ...(diagnosisText ?? '')
      .split(/[,;]+/)
      .map((label) => label.trim()),
  ].filter(Boolean);

  const seen = new Set<string>();
  return candidates.filter((label) => {
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
