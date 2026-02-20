export enum ResponseType {
  Likert = "likert",
  Numeric = "numeric",
  Binary = "binary",
  MultipleChoice = "multipleChoice",
  Checkbox = "checkbox",
  OpenEnded = "openEnded",
  Dropdown = "dropdown",
  VAS = "VAS",
  Date = "date",
}

export enum ResultFormat {
  Observation = "observation",
  ObservationBundle = "observationBundle",
}

export enum EntryMode {
  All = "all",
  Single = "single",
}

export interface AssessmentForm {
  title: string;
  description?: string;
  category: Category;
  subCategory: SubCategory; // SubCategory is now dependent on Category
  loincCode: string;
  overallScore: OverallScore;
  questions: Question[];
  scoringInterpretation?: ScoringInterpretation;
  badges?: string[];
}

export interface QuestionOption {
  label: string;
  value: string | number;
  color?: string;
}

export interface ImageConfig {
  type: "single" | "sprite" | "individual";
  singleImage?: string;
  spriteImage?: string;
  individualImages?: string[];
}

export type Question = QuestionCore | QuesstionsLikert | QuestionNumeric;

interface QuestionCore {
  id: string;
  text: string;
  responseType: ResponseType;
  defaultValue?: string | number | boolean;
  ignoreValue?: string | number | boolean;
  scoring?: boolean;
  options?: QuestionOption[] | VASOptions;
  loincCode?: string;
  unit?: string;
  system?: string;
}

export interface QuesstionsLikert extends QuestionCore {
  scores?: number[];
}

export interface QuestionNumeric extends QuestionCore {
  minValue?: number;
  maxValue?: number;
  step?: string;
}

export interface VASOptions {
  min: number;
  max: number;
  step: number;
  labels: {
    min: string;
    max: string;
  };
  imageConfig?: ImageConfig;
}

export interface AssessmentForm {
  title: string;
  description?: string;
  category: C;
  entryMode?: EntryMode;
  subCategory: SubCategory; // SubCategory is now dependent on Category
  fhirCategory?: string;
  loincCode: string;
  overallScore?: OverallScore;
  questions: (Question | QuesstionsLikert | QuestionNumeric)[];
  tags?: string[];
  scoringInterpretation?: ScoringInterpretation;
  resultFormat?: ResultFormat;
}

export interface AssessmentFormCategory<C extends Category>
  extends AssessmentForm {
  title: string;
  description?: string;
  category: C;
  subCategory: CategorySubCategories[C]; // SubCategory is now dependent on Category
  questions: Question[];
}

interface ScoringRange {
  minScore: number;
  maxScore: number;
  interpretation: ScoringInterpretationValue;
  guidance?: string;
}

interface OverallScore {
  unit: string;
  system: string;
  code: string;
}

export interface ScoringInterpretation {
  ranges: ScoringRange[];
}

export enum ScoringInterpretationValue {
  Good = "Good",
  Moderate = "Moderate",
  Poor = "Poor",
  Critical = "Critical",
}

export enum Category {
  MentalHealth = "Mental Health Assessments",
  PhysicalHealth = "Physical Health Assessments",
  GeneralHealth = "General Health Metrics",
  LabResults = "Laboratory Results",
  PreventiveHealth = "Preventive Health",
  LifestyleWellness = "Lifestyle and Wellness",
}

export enum SubCategory {
  Depression = "Depression",
  Anxiety = "Anxiety",
  Stress = "Stress",
  MoodTracking = "Mood Tracking",
  WellnessCheck = "Wellness Check",
  PainManagement = "Pain Management",
  SymptomTracking = "Symptom Tracking",
  ChronicConditionManagement = "Chronic Condition Management",
  FitnessAssessment = "Fitness Assessment",
  BodyMeasurements = "Body Measurements",
  VitalSigns = "Vital Signs",
  NutritionalIntake = "Nutritional Intake",
  SleepTracking = "Sleep Tracking",
  BloodTests = "Blood Tests",
  UrineAnalysis = "Urine Analysis",
  ImagingResults = "Imaging Results",
  OtherLabResults = "Other Lab Results",
  HealthScreenings = "Health Screenings",
  VaccinationRecords = "Vaccination Records",
  FamilyHealthHistory = "Family Health History",
  ExercisePhysicalActivity = "Exercise and Physical Activity",
  DietNutrition = "Diet and Nutrition",
  MentalWellness = "Mental Wellness",
  SubstanceUseAssessment = "Substance Use Assessment",
}

type CategorySubCategories = {
  [Category.MentalHealth]:
    | SubCategory.Depression
    | SubCategory.Anxiety
    | SubCategory.Stress
    | SubCategory.MoodTracking
    | SubCategory.WellnessCheck
    | SubCategory.PainManagement;
  [Category.PhysicalHealth]:
    | SubCategory.PainManagement
    | SubCategory.SymptomTracking
    | SubCategory.ChronicConditionManagement
    | SubCategory.FitnessAssessment;
  [Category.GeneralHealth]:
    | SubCategory.BodyMeasurements
    | SubCategory.VitalSigns
    | SubCategory.NutritionalIntake
    | SubCategory.SleepTracking;
  [Category.LabResults]:
    | SubCategory.BloodTests
    | SubCategory.UrineAnalysis
    | SubCategory.ImagingResults
    | SubCategory.OtherLabResults;
  [Category.PreventiveHealth]:
    | SubCategory.HealthScreenings
    | SubCategory.VaccinationRecords
    | SubCategory.FamilyHealthHistory;
  [Category.LifestyleWellness]:
    | SubCategory.ExercisePhysicalActivity
    | SubCategory.DietNutrition
    | SubCategory.MentalWellness
    | SubCategory.SubstanceUseAssessment;
};

type NavigationItem = {
  name: SubCategory;
  category: Category;
  forms: {
    title: string;
    form: AssessmentForm;
    description?: string;
    href: string;
  }[];
};

type Navigation = {
  name: Category | SubCategory | "Self Assessment";
  children?: Navigation[];
};

type Forms = {
  path: string;
  form: AssessmentForm;
}[];

/*
  // Example usage
  const phq9Form: AssessmentForm = {
    title: "PHQ-9 Depression Assessment",
    description: "This questionnaire helps assess depression levels...",
    questions: [
      // ...questions here
    ]
  };
  */
