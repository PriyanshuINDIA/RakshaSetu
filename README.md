#RakshaSetu

A platform for emergency contact and quick action
When seconds count, RakshaSetu helps people reach emergency staff through one
shared setup.
RakshaSetu is a web service for urgent moments. It brings citizens and the right
emergency teams together during disasters and other tense events.
The platform is split into two areas.

> Citizen app
  
- For sending an emergency report, asking for help or items, and finding nearby shelters.

> Authority or EOC dashboard
  
- For reading incoming reports, setting rescue tasks, following progress, requesting
supplies, and keeping track of how the response is going.
Both sides use the same Supabase backend. It supports sign in, uses PostgreSQL
storage, and pushes live updates. It also uses role based access rules so permissions
match the user type.

Live demo
Citizen app
https://rakshasetu-citizen.netlify.app

Authority or EOC dashboard
https://rakshasetu-authority.netlify.app

Note: the dashboard only works with a logged in authority account.

> Problem statement

During crises, messages between citizens and response teams often do not move well.
They can stall, get sent in separate paths, or show up late.

These issues tend to repeat.
- It is hard to send an emergency report quickly
- People struggle to see the current status of the incident
- Rescue teams do not coordinate smoothly
- Supply requests are tough to manage
- Shelters are hard to locate
- Weak network coverage makes calls and messages unreliable
- Different languages can add confusion
  
RakshaSetu aims to address these gaps. It connects the citizen side and the authority
side into one linked process.

> Our solution

RakshaSetu creates a clear web workflow for citizens and emergency authorities.

# RAKSHASETU

> Citizen
- I need help.
- SOS.
- I also request resources.
- Supabase backend Store the data.
- Send live updates.
- Authority or EOC See the request and handle it.
- Rescue or resource team Start the work and use the assigned items.
- Citizen Get updates on what is happening.

The core workflow is:
Report → Coordinate → Respond → Track

#Key features

1. Emergency SOS
   
People can start an SOS from the Citizen App.
After that, the case is saved in the system. Authorized staff can then view it.
Incident flow
Unassigned
Assigned
Responding
Reached
Resolved
Authorities are able to do the following.
See new alerts.
Check the details for each incident.
Send rescue teams.
Change the response stage.
Follow each case as it moves through the stages.

2. Urgent resource requests
   
People can ask for needed supplies using the platform.
Officials can look at each request, choose who handles it, and follow its progress until it
is done.
Resource flow
PENDING
 to
ASSIGNED
 to
IN_TRANSIT
 to
DELIVERED
This gives a clear process, not just help by phone calls or chat messages.

3. Shelter Support
   
People can:
- Check shelter listings
- Find nearby shelters
- Read the shelter details
- Open route directions
Officials can run the shelter data and track whether each shelter is operating.
This demo setup is for Munger, Bihar right now.

4. Multilingual Interface
   
RakshaSetu lets users choose from 23 languages.
English
Hindi
Assamese
Bengali
Bodo
Dogri
Gujarati
Kannada
Kashmiri
Konkani
Maithili
Malayalam
Manipuri / Meitei
Marathi
Nepali
Odia
Punjabi
Sanskrit
Santali
Sindhi
Tamil
Telugu
Urdu
Right to Left layout is available for Urdu and Sindhi.

5. Support for low connectivity
   
RakshaSetu works even when the network is weak or unstable.
In the Citizen App, the system has a few built-in tools. They help when a user is offline or
the signal drops. These include:
- Offline mode for normal use
- Saving events so they can be sent later
- Sync that retries until it works
- Storing location details locally
- Detecting when connectivity is back
- Using a low-data way to send updates
- Bringing back parts of the selected work state after issues
For syncing, RakshaSetu uses a practical plan. It is a best-effort sync that keeps trying.
It also follows idempotent behavior so repeats do not cause extra harm.
RakshaSetu does not promise a perfect zero-loss outcome for every device and every
kind of network failure.

#System Architecture


Citizen App

- Emergency SOS
- Resource Requests
- Shelter Assistance
- Location
- Multilingual UI
  
Connection layer

- HTTPS
- Supabase
  
Supabase services

- User sign-in
- PostgreSQL data store
- Row Level Security
- Realtime updates
- RPC and server rules
  
Realtime feed and API

- Send updates to the next system
  
Authority / EOC Dashboard

- Incident Management
- Rescue Teams
- Resource Management
- Shelter Management
- Response Tracking

  
#Security and Privacy

Security runs at more than one layer.
Authentication
Supabase Auth is used for these tasks:
- Sign up
- Log in
- Account recovery
- User sign in
Role-Based Access Control
The system splits access by these types:
- citizen
- authority
- admin
Authority rights are checked on the backend.
Users do not pick an authority role in the frontend.
Row Level Security
Supabase PostgreSQL Row Level Security (RLS) limits data access.
Rules depend on the logged-in user role and permissions.
Security Practices
- No stored authority passwords in code
- No service-role key sent to the browser
- No private API keys added to the repository
- Password reset uses Supabase Auth
- Citizen and Authority data are kept in separate auth storage
- The Authority dashboard requires a logged-in user
- Backend actions need authorization checks before they run
  
#Technology stack


Frontend

- HTML5
- CSS3
- JavaScript
- Progressive Web App setup
  
Backend and database

- Supabase
- PostgreSQL
- Supabase Authentication
- Supabase Realtime
- PostgreSQL RPC functions
- Row Level Security
  
Deployment and version control

- GitHub
- Netlify

  
#Project Structure

RakshaSetu/
- citizen/
 - index.html
 - js/
 - css/
 - auth/
 - ...
- authority/
 - index.html
 - js/
 - css/
 - ...
- docs/
- .gitignore
- README.md
  
#Regional setup

This demo setup centers on:
Munger, Bihar, India
The app also has settings for emergency response options.
When live operating data is missing, the app uses a different label. It may call it
unavailable, cached, stale, prototype, or another matching status. It does not show it as
if it is verified real time.

#RakshaSetu in Simple Steps

Emergency SOS

- First, a citizen sends an SOS
- Next, the incident is saved in Supabase
- Then, the authority gets the alert
- After that, the authority checks the case
- Soon after, a rescue team is picked
- Then, the response state is updated
- Afterward, the citizen sees the updates
- Finally, the incident ends as resolved
  
Request for Resources

- A citizen sends a resource request
- The authority receives it
- The request is assigned
- The resource is sent and moves toward the spot
- The resource arrives and is delivered
  
Shelter Steps
Citizen first
Then: View Shelter
Next: Select Shelter
Then: View Location
Last: Get Directions

#Testing and validation

We ran the main flows from start to finish.
Signal path
Citizen
send SOS
SOS request
Supabase
authority view
rescue team chosen
status messages
back to citizen
Result: Full end-to-end run
Supply path
Citizen
make resource request
authority receives request
authority assigns work
IN_TRANSIT state
DELIVERED state
Result: Full end-to-end run
Housing path
Citizen
share shelter details
add location and directions
Result: Full end-to-end run
Login and access
Citizen login
Citizen signup
Password reset
Authority login
Role-based access
Last checks
Final security review
Final end-to-end regression
Public citizen app release
Public authority app release
#Getting Started
Prerequisites
- A modern web browser
- Git
- A Supabase project
- A local static web server
Clone the Repository
Run this command:
git clone https://github.com/PriyanshuINDIA/RakshaSetu.git
Move into the folder:
cd RakshaSetu
Run Locally
Start a local static server to test the site.
One option is this:
python -m http.server 8080
Then visit:
http://localhost:8080
You will find the Citizen app and the Authority app in their own folders.
#Supabase setup
RakshaSetu needs a Supabase project that has:
- Login support for users
- A Postgres database
- Realtime updates
- Row Level Security
- RPC endpoints for the backend
Security warning
Do not push secrets to GitHub.
Avoid uploading these files or values:
- .env
- Database user passwords
- Service role keys
- Private keys
- Access tokens
- Secret API keys
For the web app, use only the publishable keys meant for browsers.

#Future scope

What comes next is listed below. These items are not part of the current release.
- Connect to official government emergency platforms
- Use confirmed real-time disaster updates
- Add more regional disaster risk files
- Set up an SMS gateway connection
- Build out improved emergency broadcast tools
- Create dedicated apps for mobile devices
- Expand deployment across many districts
- Add deeper analytics for emergency response
- Work with more emergency services
  
Team: RakshaSetu (SIH 2026) — Roles & Responsibilities

1) Krishan Kant — Researcher, Presenter & Team Lead
- Study the problem statement and relevant research papers.
- Prepare and write the content for the PPT.
- Divide tasks among team members.
- Track deadlines and overall project progress.
- Present the project and explain the key concepts to the judges.

3) Priyanshu Sharma — Developer & Module Integration
   
- Write and maintain the project code.
- Develop the Citizen PWA and Authority Dashboard.
- Build and integrate the Supabase backend.
- Implement the SOS flow.
- Connect and integrate all project modules to ensure smooth communication
between them.

3) Lushi Kumari — UI/UX Designer
   
- Design the application interface and user experience.
- Design the PPT layout, colors, and visual elements.
- Prepare icons and screenshots.
- Create flowcharts, diagrams, and other visual materials.

4) Vikram Yadav — Testing & QA

- Test the application on different mobile phones and devices.
- Test offline functionality, including airplane-mode scenarios.
- Verify whether SOS alerts successfully reach the Authority Dashboard.
- Identify, document, and report bugs and usability issues.

5) Shivam Kumar — Debugger & Planner
   
- Fix the bugs identified during testing.
- Debug technical and functionality-related issues.
- Assist in planning project tasks and implementation.
- Support the team in organizing and prioritizing development work.
- Help with project presentation and answer questions from the judges.

6) Ritik Kumar — Field Validation & Outreach
    
- Demonstrate the application to real users.
- Conduct usability testing by observing whether users can find the SOS button
without prior instructions.
- Collect and document user feedback.
- Work on the distribution and outreach strategy through schools, Panchayats, and
Jeevika groups.

#License

This work is meant for learning, hackathons, and open-source coding.
Pick the license for the repo based on what the team decides, then add it to the final
repository.

#Acknowledgement

RakshaSetu was built as a practical project for disaster support and emergency
communication.
The goal is to link people with emergency teams using one shared way of working. It is
set up to stay safe and keep running even when conditions are hard.
