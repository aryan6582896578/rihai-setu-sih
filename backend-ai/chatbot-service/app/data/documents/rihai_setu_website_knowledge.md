# RIHAI SETU website and AI features

RIHAI SETU is a rehabilitation and post-release employment support project. Its
current AI demonstration contains a job recommender and a support chatbot. It
does not replace an NGO caseworker, employer, lawyer, doctor, court or public
authority.

## Job recommender

The recommender compares a consenting candidate's verified employment profile
with active job requirements. It uses verified skills, certificates, employment
experience, preferred job categories and preferred districts. It deliberately
does not use offence, sentence, bail, caste, religion, gender, recidivism or
other criminal-history information.

The system standardises skill names with a controlled skill dictionary. Exact
phrases, synonyms and controlled typo recovery map variations to canonical
skills. It then calculates a deterministic score out of 100: required skills 35
points, preferred skills 15 points, overall canonical-skill similarity 20
points, certificates 5 points, experience 5 points, preferred district 10
points and preferred job category 10 points.

The same candidate and job input always produces the same result. The response
shows matched skills, missing skills, missing certificates, component scores
and an explanation. A candidate without explicit consent is not eligible. A
closed or paused job is not eligible.

The current demonstration candidate ID is a request identifier, not a database
lookup. A non-empty demonstration ID works when the user also enters the
candidate's profile. In a future integrated system, the main backend can load a
saved candidate profile using that ID.

## Support chatbot

The chatbot answers questions about RIHAI SETU, employment, job applications,
skills, training, rehabilitation, interview preparation and general access to
approved legal-aid services. It uses approved FAQs and retrieved passages from
official documents. Ollama runs locally and generates an answer only from the
retrieved context.

The chatbot must not provide personal legal advice, predict a court decision,
decide bail or release eligibility, diagnose a medical condition or handle an
emergency. Those questions are redirected to an authorised NGO caseworker,
legal-aid provider, relevant emergency service or portal administrator.

## Current demonstration architecture

The React and TypeScript demonstration frontend calls two independent Python
FastAPI services. The employment recommender normally runs on port 8000. The
chatbot normally runs on port 8001 and uses the local Ollama model. The current
demonstration has no authentication and does not use a production database.

## Using the website

On the Job Recommender page, enter a candidate ID, verified skills,
certificates, experience in months, preferred district and preferred category.
Select Find Matching Jobs to see ranked sample jobs, a score, matching skills
and skills to build.

On the Support Chatbot page, ask a question about employment, skills, training,
rehabilitation or RIHAI SETU. The chatbot should decline unrelated questions
and should escalate personal legal, medical, emergency and self-harm questions.
