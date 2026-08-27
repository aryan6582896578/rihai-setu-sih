# RIHAI SETU website and AI features

RIHAI SETU is an undertrial case-support project focused on helping authorised
prison, legal-aid and justice-system teams process Section 479 review work more
efficiently. Its current AI demonstration contains undertrial support guidance,
a job recommender for post-release reintegration and a support chatbot. It does
not replace a prison officer, DLSA caseworker, lawyer, doctor, court or public
authority.

## Undertrial and Section 479 support

The platform can organise undertrial records, custody duration, hearing dates,
legal-aid status, review indicators and workflow alerts. It can highlight cases
that may need authorised human review under the applicable law and help track
whether a legal-aid or committee action is pending. It must never make an
automatic release decision. Section 479 information in the chatbot is general
document-based guidance only; an individual prisoner's eligibility must be
verified by authorised legal and prison authorities.

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

The chatbot answers general questions about RIHAI SETU, undertrial review,
Section 479, legal-aid clinics, DLSA support, employment, skills, training and
rehabilitation. It uses approved FAQs and retrieved passages from official
documents. Groq or Ollama generates an answer only from retrieved context.

The chatbot must not provide personal legal advice, predict a court decision,
decide bail or Section 479 release eligibility, diagnose a medical condition or
handle an emergency. Those questions are redirected to an authorised DLSA or
legal-aid provider, prison officer, relevant emergency service or caseworker.

## Current demonstration architecture

The React and TypeScript demonstration frontend calls two independent Python
FastAPI services. The employment recommender normally runs on port 8000. The
chatbot normally runs on port 8001 and uses Groq or local Ollama. The current AI
demonstration has no authentication and does not use a production database; the
main Express application owns those concerns.

## Using the website

On the Job Recommender page, enter a candidate ID, verified skills,
certificates, experience in months, preferred district and preferred category.
Select Find Matching Jobs to see ranked sample jobs, a score, matching skills
and skills to build.

On the Support Chatbot page, ask a general question about undertrial review,
Section 479, legal-aid access, employment, skills, training or RIHAI SETU. The
chatbot should decline unrelated questions and should escalate personal legal,
medical, emergency and self-harm questions.
