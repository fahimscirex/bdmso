-- Seed team_members from the hardcoded team.astro. Clears first so re-running
-- doesn't duplicate. Run --local now; --remote ships with the deploy.
--   wrangler d1 execute bdmso --local --file=./db/seeds/team_members.sql

DELETE FROM team_members;

-- Section 1: Bangladesh delegation (2025) - Mathematics
INSERT INTO team_members (section, subgroup, year, name, role, affiliation, image, sort_order, published) VALUES
  ('delegation', 'Mathematics', '2025', 'Arijit Saha', '🥈 Silver', NULL, '/images/team/arijit-saha.webp', 1, 1),
  ('delegation', 'Mathematics', '2025', 'Ehan Abrad Rahman', '🥉 Bronze', NULL, '/images/team/ehan-rahman.webp', 2, 1),
  ('delegation', 'Mathematics', '2025', 'Labiba Binte Fazlay Rabbee', '🥉 Bronze', NULL, '/images/team/labiba-rabbee.webp', 3, 1),
  ('delegation', 'Mathematics', '2025', 'Md Nabeeh Hossain', '🥉 Bronze', NULL, '/images/team/nabeeh-hossain.webp', 4, 1),
  ('delegation', 'Mathematics', '2025', 'Rafsan Shafiq Talukder', '🥉 Bronze', NULL, '/images/team/rafsan-talukder.webp', 5, 1),
  ('delegation', 'Mathematics', '2025', 'Wafia Hasan Othoi', '🥉 Bronze', NULL, '/images/team/wafia-othoi.webp', 6, 1);

-- Section 1: Bangladesh delegation (2025) - Science
INSERT INTO team_members (section, subgroup, year, name, role, affiliation, image, sort_order, published) VALUES
  ('delegation', 'Science', '2025', 'Aaqib Fattah Mustofi', '🥉 Bronze', NULL, '/images/team/aaqib-mustofi.webp', 1, 1),
  ('delegation', 'Science', '2025', 'Avigyan Roy Golpo', '🥉 Bronze', NULL, '/images/team/avigyan-golpo.webp', 2, 1),
  ('delegation', 'Science', '2025', 'Md Miftahul Islam', '🥉 Bronze', NULL, '/images/team/miftahul-islam.webp', 3, 1),
  ('delegation', 'Science', '2025', 'Shahabi Ibn Kabbo', '🥉 Bronze', NULL, '/images/team/shahabi-kabbo.webp', 4, 1),
  ('delegation', 'Science', '2025', 'Syed Ayaan Isa', '🥉 Bronze', NULL, '/images/team/ayaan-isa.webp', 5, 1),
  ('delegation', 'Science', '2025', 'Tahmid Hasan', '🥈 Silver', NULL, '/images/team/tahmid-hasan.webp', 6, 1);

-- Section 1: Bangladesh delegation (2025) - Leadership (tutors + team leaders)
INSERT INTO team_members (section, subgroup, year, name, role, affiliation, image, sort_order, published) VALUES
  ('delegation', 'Leadership', '2025', 'Md Tanvirul Islam', 'Team Leader', 'Program Lead, BdMSO', '/images/team/tanvirul-islam.webp', 1, 1),
  ('delegation', 'Leadership', '2025', 'Hasan Muhammed Zahidul Amin', 'Team Leader', 'VP · Society for Popularization of Science, Bangladesh', '/images/team/zahidul-amin.webp', 2, 1),
  ('delegation', 'Leadership', '2025', 'Juty Singha', 'Math Tutor', NULL, '/images/team/juty-singha.webp', 3, 1),
  ('delegation', 'Leadership', '2025', 'Mim Naz Rahman', 'Science Tutor', NULL, '/images/team/mim-naz-rahman.webp', 4, 1);

-- Section 2: Advisors
INSERT INTO team_members (section, subgroup, year, name, role, affiliation, image, sort_order, published) VALUES
  ('advisor', NULL, NULL, 'Munir Hasan', NULL, 'President, SPSB & BdOSN', '/images/team/munir-hasan.webp', 1, 1),
  ('advisor', NULL, NULL, 'Dr. Farseem Mannan', NULL, 'GS, SPSB', '/images/team/farseem_mannan.webp', 2, 1),
  ('advisor', NULL, NULL, 'Zahidul Amin', NULL, 'CTO, Kona SL', '/images/team/zahidul_amin.webp', 3, 1);

-- Section 3: Organizing team
INSERT INTO team_members (section, subgroup, year, name, role, affiliation, image, sort_order, published) VALUES
  ('organizing', NULL, NULL, 'Tanvir Rivnat', 'Program Lead', NULL, '/images/team/tanvirul-islam.webp', 1, 1),
  ('organizing', NULL, NULL, 'Rezaul Islam', 'Outreach Activity', NULL, '/images/team/rezaul_islam.webp', 2, 1),
  ('organizing', NULL, NULL, 'Mim Naz Rahman', 'Academics', NULL, '/images/team/mim-naz-rahman.webp', 3, 1),
  ('organizing', NULL, NULL, 'Fahim Montasir', 'Digital & Social Media', NULL, '/images/team/fahim_montasir.webp', 4, 1);

-- Section 4: Mentors & volunteers
INSERT INTO team_members (section, subgroup, year, name, role, affiliation, image, sort_order, published) VALUES
  ('mentor', NULL, NULL, 'Morsheda Akter Mim', 'Pharmacy, DU', NULL, '/images/team/morsheda_mim.webp', 1, 1),
  ('mentor', NULL, NULL, 'Ovejan Paul Rudra', 'RA, DOB', NULL, '/images/team/ovejan_paul.webp', 2, 1),
  ('mentor', NULL, NULL, 'Farzana Akter Lima', 'PM, CASSA', NULL, '/images/team/farzana_lima.webp', 3, 1),
  ('mentor', NULL, NULL, 'Samira Sumaia', 'Arch, BUET', NULL, '/images/team/samira_sumaia.webp', 4, 1),
  ('mentor', NULL, NULL, 'Parag Kumar Kabiraj', 'EEE, BUET', NULL, '/images/team/parag_kumar.webp', 5, 1),
  ('mentor', NULL, NULL, 'Ariba Jahin', 'MBBS Student, ShSMC', NULL, '/images/team/ariba_jahan.webp', 6, 1),
  ('mentor', NULL, NULL, 'Nahar Authoy', 'EEE, AUST', NULL, '/images/team/nahar_authoy.webp', 7, 1),
  ('mentor', NULL, NULL, 'Samin Yasar Ahmed', 'CSE, NSU', NULL, '/images/team/samin_yasar.webp', 8, 1),
  ('mentor', NULL, NULL, 'MD. Rahad Hasan', 'Physics, GBC', NULL, '/images/team/rahad_hasan.webp', 9, 1),
  ('mentor', NULL, NULL, 'Shamim Ara Islam', 'A Levels, MLIS', NULL, '/images/team/matra.webp', 10, 1);

-- Section 5: Alumni
INSERT INTO team_members (section, subgroup, year, name, role, affiliation, image, sort_order, published) VALUES
  ('alumni', NULL, NULL, 'Juty Singha', 'Lecturer, DIU', NULL, '/images/team/juty-singha.webp', 1, 1);
