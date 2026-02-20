const modules = import.meta.glob("./forms/*.json");

/*
const forms = Object.keys(modules).map(async (path) => {
    return modules[path]().then((mod) => {
        return mod.default;
      })
});
*/

export default modules;

export const loadedForms = Promise.all(
  Object.keys(modules).map(async (path) => {
    return {
      path,
      form: JSON.parse(JSON.stringify(await modules[path]())),
    };
  }),
);

export const forms = Promise.resolve(loadedForms);

export async function getByCode(loincCode: string): Promise<any> {
  return await forms.then((forms) => {
    return forms.find((form) => {
      return form.form.loincCode === loincCode;
    })?.form;
  });
}

export async function getScoringInterpetation(
  loincCode: string,
  score: number,
): Promise<any> {
  const form = await getByCode(loincCode);
  console.log(loincCode, form);
  return form?.scoringInterpretation.ranges.find((interpretation: any) => {
    return score >= interpretation.minScore && score <= interpretation.maxScore;
  });
}
