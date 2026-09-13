---
slug: jixia
title: Jixia
date: 2026-09-12
description: AI harness framework for self-managed study
disciplines:
  - ai
  - agentic-development
  - software
  - education
tags:
  - ai
  - python
  - skills
  - harness-engineering
featured: true
featuredOrder: 5
draft: false
repositoryUrl: https://github.com/marcybelardo/jixia
---

Jixia is a file-based personal study environment operated through your harness of choice. It should work as long as you can use `AGENTS.md` files and skills. It provides browsable lesson PDFs, exercises, feedback, midterms, finals, and durable progress records. There's also a local Python static site generator so student-facing records in the system are easier to access.

The harness is the working interface, Markdown files contain the state, and PDFs and HTML can be generated as reading copies. Use your version control of choice to keep everything backed up and synced across devices.

### Rationale

I started studying Math on my own sometime last year. This has mostly consisted of following along with the excellent YouTube Math courses provided by [The College Prep School](https://www.youtube.com/@thecollegeprepschool4486). As I began learning how to use skills and AI harnesses, I started to ask if it was possible to design a working personal tutor system to continue my learning, especially as I was going into Geometry and I wanted a more back-and-forth way to practice writing proofs. I built the base of Jixia in a day, taking the name from the historic Chinese scholarly center of the Warring States period.

Jixia was refined as I used it. The current repository may actually still contain my in-progress Geometry work. I'll probably refine the project to be fully usable by anyone who's interested.

### Skills

Jixia is mostly the product of four skills that work together to run a course.

#### create-course

- Plans, initializes, and then adversarially reviews a new course for the Jixia repository.
- Establishes the subject to study, the student's starting level and possible prerequisites, learning outcomes, etc.
- Designs the course, and then runs a subagent review to check for the student's knowledge gaps, unrealistic course pacing, outcomes, unnecessary scope, and general factual correctness.

#### produce-lesson

- Checks for the next lesson, and create materials necessary to run it.
- Runs a subagent review afterwards for factual accuracy (claims, citations, calculations, definitions, etc.) and teaching (clarity, ambiguity, difficulty, etc.)

#### start-study-session

- Opens the session, sets two to five learning objectives, and takes note of any unfinished prerequisites, overdue work, conflicts, or review concerns.
- Teaches the class, activates prior knowledge, guides the student through a worked example, etc.
- Keeps track of what the student understands every class and records it.

#### assess-submission

- When the student submits work, it is judged against explicit criteria, preserves what the student sent it, and updates the academic records
- Afterwards, delegates a subagent to review the assessment to see if it is fair, mistaken, and to provide its own independent judgment of the submission.

### Scope and Limitations

I've been using it for about two months now to learn Geometry, and by all accounts, it works. I generally cross-reference with textbooks to see if I can apply what I've learned to existing sources and real-world problems. I assume that it's able to teach Geometry pretty well because there is a boundless amount of data in its training for this. If I were to refine the project further, it would be to find a way to make it teach _from_ existing data rather than to just pull from training. That would require getting access to authoritative teaching data first, which I think isn't impossible, but is a little higher-effort than just having it generate stuff.

Overall, I'm happy with how the project works and functions. It's taught me a lot about skills and harnesses, especially in determining where they still lack refinement. I'm always a little hesitant to let other people use my projects, but if you'd like to try out Jixia for yourself, you can copy out the skills in this repo and give it a whirl.
