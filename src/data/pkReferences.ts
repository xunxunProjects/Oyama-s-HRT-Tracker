/**
 * Papers and guidance used by the pharmacokinetic model work tracked from
 * issue #200 onward. Kept as static data so the Credits page still loads
 * nothing from third parties.
 *
 * Each row is a link plus one line saying what the model uses it for. The
 * list is deliberately grouped; a flat list of fifty citations is hard to
 * scan. Add new sources to the group they inform.
 */
export interface PkReference {
    /** Short citation, written to be scanned rather than copied. */
    name: string;
    /** PubMed, DOI, or the guidance page itself. */
    href: string;
    /** Journal and what the model uses the source for. */
    desc: string;
}

export interface PkReferenceGroup {
    title: string;
    references: PkReference[];
}

export const PK_REFERENCE_GROUPS: PkReferenceGroup[] = [
    {
        title: 'Estradiol, SHBG, and free hormone',
        references: [
            {
                name: 'Narinx et al., 2022 — SHBG and the free-hormone hypothesis',
                href: 'https://pubmed.ncbi.nlm.nih.gov/36205798/',
                desc: 'Cell Mol Life Sci. SHBG binding and free-testosterone interpretation.',
            },
            {
                name: 'Södergård et al., 1982 — Free and bound testosterone and estradiol',
                href: 'https://doi.org/10.1016/0022-4731(82)90038-3',
                desc: 'J Steroid Biochem. Binding model used for free-hormone fractions.',
            },
            {
                name: 'Dunn et al., 1981 — Steroid binding to SHBG and CBG',
                href: 'https://pubmed.ncbi.nlm.nih.gov/7195404/',
                desc: 'J Clin Endocrinol Metab. Binding affinities for free-hormone calculation.',
            },
            {
                name: 'Ropponen et al., 2005 — Oral vs transdermal estradiol and SHBG',
                href: 'https://pubmed.ncbi.nlm.nih.gov/15784702/',
                desc: 'J Clin Endocrinol Metab. Route-dependent SHBG changes.',
            },
            {
                name: 'Rosner et al., 2013 — Estradiol measurement position statement',
                href: 'https://pubmed.ncbi.nlm.nih.gov/23463657/',
                desc: 'J Clin Endocrinol Metab. Assay limitations behind the estradiol inputs.',
            },
            {
                name: 'Stanczyk et al., 2022 — Population PK of a transdermal steroid',
                href: 'https://pubmed.ncbi.nlm.nih.gov/36574387/',
                desc: 'PLoS One. Population-PK structure and predicted hormone levels.',
            },
            {
                name: 'Zhang et al., 2024 — Oral estradiol valerate PK',
                href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11246651/',
                desc: 'PMC. Oral EV half-life, Tmax, and exposure used for kE1Pool.',
            },
            {
                name: 'Fiers et al., 2018 — Free testosterone by LC-MS/MS dialysis',
                href: 'https://pubmed.ncbi.nlm.nih.gov/29618085/',
                desc: 'J Clin Endocrinol Metab. Free-T calculation and assay comparison.',
            },
        ],
    },
    {
        title: 'Transmasculine testosterone: dosage forms',
        references: [
            {
                name: 'Swerdloff et al., 2020 — Oral testosterone undecanoate',
                href: 'https://pubmed.ncbi.nlm.nih.gov/32382745/',
                desc: 'J Clin Endocrinol Metab. PK of a self-emulsifying oral TU formulation.',
            },
            {
                name: 'Yin et al., 2012 — Oral testosterone undecanoate PK',
                href: 'https://pubmed.ncbi.nlm.nih.gov/21474786/',
                desc: 'J Androl. Re-examined oral TU pharmacokinetics.',
            },
            {
                name: 'Rogol et al., 2016 — Testosterone nasal gel',
                href: 'https://pubmed.ncbi.nlm.nih.gov/26695758/',
                desc: 'Andrology. PK of a nasal testosterone gel.',
            },
            {
                name: 'Handelsman et al., 1990 — Testosterone pellets',
                href: 'https://pubmed.ncbi.nlm.nih.gov/2115044/',
                desc: 'J Clin Endocrinol Metab. Pellet PK and androgen response.',
            },
            {
                name: 'McCullough et al., 2014 — Testosterone pellet review',
                href: 'https://pubmed.ncbi.nlm.nih.gov/25999802/',
                desc: 'Curr Sex Health Rep. Pellet dosing and duration context.',
            },
            {
                name: 'Figueiredo et al., 2022 — Subcutaneous testosterone injections',
                href: 'https://pubmed.ncbi.nlm.nih.gov/34698352/',
                desc: 'J Clin Endocrinol Metab. SC injection PK and practicality.',
            },
            {
                name: 'Turner et al., 2019 — Subcutaneous testosterone undecanoate',
                href: 'https://pubmed.ncbi.nlm.nih.gov/31384715/',
                desc: 'J Endocr Soc. SC TU PK and acceptability.',
            },
            {
                name: 'Mazer et al., 2005 — Testosterone patch vs gel',
                href: 'https://pubmed.ncbi.nlm.nih.gov/16422889/',
                desc: 'J Sex Med. Steady-state PK and variability by route.',
            },
            {
                name: 'Swerdloff et al., 2000 — Long-term transdermal testosterone gel',
                href: 'https://pubmed.ncbi.nlm.nih.gov/11134099/',
                desc: 'J Clin Endocrinol Metab. Long-term testosterone gel PK.',
            },
            {
                name: 'Marbury et al., 2003 — Testim vs AndroGel',
                href: 'https://pubmed.ncbi.nlm.nih.gov/12673669/',
                desc: 'Biopharm Drug Dispos. Comparative topical testosterone gel PK.',
            },
        ],
    },
    {
        title: 'Transmasculine testosterone: safety and context',
        references: [
            {
                name: 'da Silva et al., 2024 — Uterine changes on testosterone',
                href: 'https://pubmed.ncbi.nlm.nih.gov/39049785/',
                desc: 'Eur J Endocrinol. Uterine effects of testosterone therapy.',
            },
            {
                name: 'Canbolat et al., 2026 — Uterine and ovarian histopathology',
                href: 'https://pubmed.ncbi.nlm.nih.gov/42796076/',
                desc: 'J Clin Med. Histopathological effects of testosterone therapy.',
            },
            {
                name: 'Barrera et al., 2023 — Testosterone concerns after hysterectomy',
                href: 'https://pubmed.ncbi.nlm.nih.gov/35850361/',
                desc: 'J Pediatr Adolesc Gynecol. T management after hysterectomy and oophorectomy.',
            },
            {
                name: 'Reilly et al., 2019 — Knowledge gaps in gender-affirming surgery',
                href: 'https://pubmed.ncbi.nlm.nih.gov/31503150/',
                desc: 'Obstet Gynecol. Evidence gaps around hysterectomy and oophorectomy.',
            },
            {
                name: 'Light et al., 2014 — Pregnancy after transition',
                href: 'https://pubmed.ncbi.nlm.nih.gov/25415163/',
                desc: 'Obstet Gynecol. Pregnancy and fertility after testosterone exposure.',
            },
            {
                name: 'Barrero et al., 2023 — Fertility preservation on testosterone',
                href: 'https://pubmed.ncbi.nlm.nih.gov/37810944/',
                desc: 'Transgend Health. Oocyte retrieval during and after testosterone.',
            },
            {
                name: 'Nackeeran et al., 2022 — Testosterone route and hematocrit',
                href: 'https://pubmed.ncbi.nlm.nih.gov/34445892/',
                desc: 'J Urol. Route-specific hematocrit changes.',
            },
            {
                name: 'Madsen et al., 2021 — Erythrocytosis in trans men',
                href: 'https://pubmed.ncbi.nlm.nih.gov/33599731/',
                desc: 'J Clin Endocrinol Metab. Long-term hematocrit risk.',
            },
            {
                name: 'Okano et al., 2025 — Testosterone formulations and hematocrit',
                href: 'https://pubmed.ncbi.nlm.nih.gov/39011565/',
                desc: 'Andrology. Systematic review of formulation effects on hematocrit.',
            },
            {
                name: 'Okano et al., 2025 — 100 mg testosterone cypionate and erythrocytosis',
                href: 'https://pubmed.ncbi.nlm.nih.gov/41052128/',
                desc: 'J Sex Med. Randomized pilot on dose and erythrocytosis.',
            },
            {
                name: 'Nimitpanya et al., 2026 — Body fat and composition on testosterone',
                href: 'https://pubmed.ncbi.nlm.nih.gov/42170522/',
                desc: 'Transgend Health. Short-term body-composition changes.',
            },
            {
                name: 'Lundberg et al., 2024 — Fat, muscle, and cardiometabolic changes',
                href: 'https://pubmed.ncbi.nlm.nih.gov/39604308/',
                desc: 'J Intern Med. Five-year body-composition context.',
            },
            {
                name: 'Dela Cruz et al., 2023 — Mouse model of pubertal suppression and T',
                href: 'https://pubmed.ncbi.nlm.nih.gov/36484619/',
                desc: 'Hum Reprod. Preclinical model for transmasculine treatment.',
            },
            {
                name: "T'Sjoen et al., 2019 — Endocrinology of transgender medicine",
                href: 'https://pubmed.ncbi.nlm.nih.gov/30307546/',
                desc: 'Endocr Rev. Clinical endocrinology and treatment context.',
            },
            {
                name: 'Costa et al., 2018 — Testosterone recommendations for trans men',
                href: 'https://pubmed.ncbi.nlm.nih.gov/29913543/',
                desc: 'Rev Bras Ginecol Obstet. Brazilian clinical recommendations.',
            },
            {
                name: 'Spanos et al., 2020 — Insulin resistance and body composition',
                href: 'https://pubmed.ncbi.nlm.nih.gov/32180895/',
                desc: 'World J Diabetes. Metabolic effects of gender-affirming hormone therapy.',
            },
            {
                name: 'Ford et al., 2022 — Body composition and bone health',
                href: 'https://pubmed.ncbi.nlm.nih.gov/35509260/',
                desc: 'J Hum Nutr Diet. Body-composition and bone outcomes.',
            },
            {
                name: 'Carbonnel et al., 2021 — The uterus in transgender men',
                href: 'https://pubmed.ncbi.nlm.nih.gov/34364678/',
                desc: 'Fertil Steril. Uterine effects and gynecologic care.',
            },
            {
                name: 'Cheung et al., 2024 — Physical performance on GAHT',
                href: 'https://pubmed.ncbi.nlm.nih.gov/37437247/',
                desc: 'J Clin Endocrinol Metab. Performance and body-composition context.',
            },
            {
                name: 'Iannantuoni et al., 2021 — Inflammation and leukocyte-endothelium',
                href: 'https://pubmed.ncbi.nlm.nih.gov/33032814/',
                desc: 'Fertil Steril. Vascular and inflammatory effects of testosterone.',
            },
        ],
    },
    {
        title: 'HPG axis, anti-androgens, and suppression',
        references: [
            {
                name: 'Misakian et al., 2025 — Injectable estradiol monotherapy',
                href: 'https://pubmed.ncbi.nlm.nih.gov/40639470/',
                desc: 'Endocr Pract. Estradiol monotherapy suppression of endogenous testosterone.',
            },
            {
                name: 'Cortez et al., 2023 — TREAT study protocol',
                href: 'https://pubmed.ncbi.nlm.nih.gov/38133914/',
                desc: 'JMIR Res Protoc. Estradiol regimen comparison and safety.',
            },
            {
                name: 'Collet et al., 2023 — Testosterone and adrenal androgens after gonadectomy',
                href: 'https://pubmed.ncbi.nlm.nih.gov/36201493/',
                desc: 'J Clin Endocrinol Metab. Androgen changes with and without gonadectomy.',
            },
            {
                name: 'Hümpel et al., 1977 — Cyproterone acetate bioavailability',
                href: 'https://pubmed.ncbi.nlm.nih.gov/880829/',
                desc: 'Contraception. Oral cyproterone acetate pharmacokinetics.',
            },
            {
                name: 'Lee et al., 2009 — Bicalutamide pharmacokinetics',
                href: 'https://pubmed.ncbi.nlm.nih.gov/20110037/',
                desc: 'Clin Ther. Bicalutamide formulation pharmacokinetics.',
            },
            {
                name: 'Overdiek et al., 1985 — Spironolactone pharmacokinetics',
                href: 'https://pubmed.ncbi.nlm.nih.gov/4042530/',
                desc: 'Clin Pharmacol Ther. Spironolactone pharmacokinetics.',
            },
            {
                name: 'Zhou et al., 1998 — Medroxyprogesterone acetate pharmacokinetics',
                href: 'https://pubmed.ncbi.nlm.nih.gov/9693401/',
                desc: 'Contraception. MPA pharmacokinetics after injection.',
            },
            {
                name: 'Sennello et al., 1986 — Leuprolide pharmacokinetics',
                href: 'https://pubmed.ncbi.nlm.nih.gov/3083092/',
                desc: 'J Pharm Sci. IV and subcutaneous leuprolide pharmacokinetics.',
            },
            {
                name: 'Bouchot et al., 1998 — Triptorelin pharmacokinetics and pharmacodynamics',
                href: 'https://pubmed.ncbi.nlm.nih.gov/9701702/',
                desc: 'Horm Res. Three-month triptorelin pharmacokinetics and pharmacodynamics.',
            },
        ],
    },
    {
        title: 'Monitoring, assays, and population PK',
        references: [
            {
                name: "O'Connell et al., 2022 — Cardiometabolic outcomes in trans youth",
                href: 'https://pubmed.ncbi.nlm.nih.gov/36221797/',
                desc: 'J Clin Endocrinol Metab. Cardiometabolic monitoring context.',
            },
            {
                name: 'Hamidi et al., 2019 — Transfeminine hormone therapy',
                href: 'https://pubmed.ncbi.nlm.nih.gov/31027544/',
                desc: 'Endocrinol Metab Clin North Am. Clinical transfeminine care.',
            },
            {
                name: 'Defreyne et al., 2019 — Transmasculine hormone therapy',
                href: 'https://pubmed.ncbi.nlm.nih.gov/31027545/',
                desc: 'Endocrinol Metab Clin North Am. Clinical transmasculine care.',
            },
            {
                name: 'Alotaibi et al., 2026 — Metoprolol PK on gender-affirming therapy',
                href: 'https://pubmed.ncbi.nlm.nih.gov/42878231/',
                desc: 'Xenobiotica. Drug-PK interaction context for GAHT.',
            },
            {
                name: 'Pouw et al., 2024 — Laboratory monitoring of GAHT',
                href: 'https://pubmed.ncbi.nlm.nih.gov/38452266/',
                desc: 'J Appl Lab Med. Monitoring and assay practice.',
            },
        ],
    },
    {
        title: 'Labels and guidelines',
        references: [
            {
                name: 'WPATH Standards of Care, version 8',
                href: 'https://doi.org/10.1080/26895269.2022.2100644',
                desc: 'Treatment and monitoring framework for gender-affirming care.',
            },
            {
                name: 'Endocrine Society guideline, 2017',
                href: 'https://doi.org/10.1210/jc.2017-01658',
                desc: 'Endocrine treatment of gender-dysphoric and gender-incongruent persons.',
            },
            {
                name: 'UCSF Gender Affirming Health Program',
                href: 'https://transcare.ucsf.edu/guidelines',
                desc: 'Masculinizing and feminizing hormone therapy guidance.',
            },
            {
                name: 'Drug labels and prescribing information',
                href: 'https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/blob/main/Algorithm%20Explanation.md',
                desc: 'EstroGel, Divigel, Climara, Vivelle-Dot, AndroGel, Angeliq, Xyosted, Aveed, Azmiro, Nebido, and Androcur/Dianette.',
            },
        ],
    },
];

export const PK_REFERENCE_COUNT = PK_REFERENCE_GROUPS.reduce(
    (total, group) => total + group.references.length,
    0,
);
