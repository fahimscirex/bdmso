-- Seed press_mentions, hall_of_fame_photos, and medalists from the existing
-- content (media.astro press cards, results.json photos, results.astro 2025
-- medalists). Dates normalized to ISO (yyyy-mm-dd, or yyyy-mm when the source
-- only gave a month). Idempotent-ish: clears the three tables first so re-running
-- doesn't duplicate. Run --local now; --remote ships with the deploy.
--
--   wrangler d1 execute bdmso --local --file=./db/seeds/marketing_datasets.sql

DELETE FROM press_mentions;
DELETE FROM hall_of_fame_photos;
DELETE FROM medalists;

-- ── Press mentions (canonical set from media.astro, self-hosted images) ──────
INSERT INTO press_mentions (outlet, title, url, published_on, image, featured, sort_order, published) VALUES
  ('The Business Standard', 'Bangladesh wins two silver, ten bronze at IMSO 2025 - every team member medals on debut.', 'https://www.tbsnews.net/economy/corporates/bangladesh-wins-two-silver-ten-bronze-imso-2025-1256606', '2025-10-09', '/images/press/tbs-imso-2025.webp', 1, 1, 1),
  ('Digi Bangla', '12 primary students'' Bangladesh team heading to Malaysia for IMSO on October 4.', 'https://digibanglatech.news/156729', '2025-10-04', '/images/imso-inaugaration-2025.webp', 0, 2, 1),
  ('Computer Bichitra', '12 students from Bangladesh participating in IMSO''s 22nd edition in Malaysia.', 'https://computerbichitra.com/%E0%A6%86%E0%A6%87%E0%A6%8F%E0%A6%AE%E0%A6%8F%E0%A6%B8%E0%A6%93-%E0%A6%8F%E0%A6%B0-%E0%A7%A8%E0%A7%A8%E0%A6%A4%E0%A6%AE-%E0%A6%86%E0%A6%B8%E0%A6%B0%E0%A7%87-%E0%A6%85%E0%A6%82%E0%A6%B6%E0%A6%97/', '2025-10', '/images/group-pre-international.webp', 0, 3, 1),
  ('Prothom Alo', '12-member Bangladesh team heading to Malaysia to participate in IMSO.', 'https://www.prothomalo.com/technology/science/s94ky51q9o', '2025-09-30', '/images/press/prothomalo-imso-malaysia.webp', 0, 4, 1),
  ('Prothom Alo', 'BdMSO 2025 national round: a talent show for primary students at St. Joseph.', 'https://www.prothomalo.com/bangladesh/6tjkpvb864', '2025-08-22', '/images/press/prothomalo-saint-joseph.webp', 0, 5, 1),
  ('The Business Standard', 'Bangladesh hosts its first-ever maths and science olympiad for primary students.', 'https://www.tbsnews.net/economy/corporates/bangladesh-hosts-first-ever-maths-and-science-olympiad-primary-students-1218016', '2025-08-06', '/images/press/tbs-bdmso-national.webp', 0, 6, 1),
  ('Digi Bangla', 'First national Mathematics and Science Olympiad held with primary school students.', 'https://digibanglatech.news/157925', '2025-08', '/images/national-round-winners.webp', 0, 7, 1),
  ('Daily ICT News', 'Registration opens for Bangladesh''s first-ever primary maths and science olympiad.', 'https://www.dailyictnews.com/14778', '2025-07', '/images/press/dailyictnews-registration.webp', 0, 8, 1),
  ('Bigganchinta', 'BdMSO being organized for the first time in Bangladesh - registration now open.', 'https://www.bigganchinta.com/events/xtdnb55d2j', '2025-07', '/images/press/bigganchinta-launch.webp', 0, 9, 1);

-- ── Hall of Fame slider photos (from results.json photos) ────────────────────
INSERT INTO hall_of_fame_photos (image, caption, year, sort_order, published) VALUES
  ('/images/imso-inaugaration-2025.webp', 'IMSO 2025 inauguration ceremony · Malaysia', '2025', 1, 1),
  ('/images/team/parliament-2025.webp', 'Bangladesh delegation · pre-international 2025', '2025', 2, 1),
  ('/images/national-round-winners.webp', 'National round winners · BdMSO 2025', '2025', 3, 1),
  ('/images/winner_banner.webp', 'Winners'' group photo · IMSO 2025', '2025', 4, 1);

-- ── Medalists (BdMSO 2025, from results.astro) ───────────────────────────────
INSERT INTO medalists (year, category, medal, name, school, sort_order, published) VALUES
  ('2025', 'Mathematics', 'gold', 'Ali Omar', 'St. Joseph HSS · 5', 1, 1),
  ('2025', 'Mathematics', 'gold', 'Arijit Saha', 'St. Joseph HSS · 5', 2, 1),
  ('2025', 'Mathematics', 'gold', 'Md. Nabeeh Hossain', 'St. Joseph HSS · 5', 3, 1),
  ('2025', 'Mathematics', 'gold', 'Nowshin Saiyara Sahrin', 'BAF Shaheen Kurmitola · 5', 4, 1),
  ('2025', 'Mathematics', 'silver', 'Abdul Muhaimin Afif', 'St. Joseph HSS · 4', 1, 1),
  ('2025', 'Mathematics', 'silver', 'Ahanaf Adib', 'St. Joseph Int''l · 5', 2, 1),
  ('2025', 'Mathematics', 'silver', 'Ehan Abrad Rahman', 'St. Joseph HSS · 5', 3, 1),
  ('2025', 'Mathematics', 'silver', 'Labiba Binte Fazlay Rabbee', 'Mastermind · 5', 4, 1),
  ('2025', 'Mathematics', 'silver', 'Md. Shahid Morsalin', 'St. Joseph HSS · 5', 5, 1),
  ('2025', 'Mathematics', 'silver', 'Md. Tahsin Ul Islam', 'St. Joseph Int''l · 5', 6, 1),
  ('2025', 'Mathematics', 'silver', 'Rafsan Shafiq Talukder', 'Bonwary Lal Govt. HS · 5', 7, 1),
  ('2025', 'Mathematics', 'silver', 'Rushan Mahmud', 'St. Joseph HSS · 4', 8, 1),
  ('2025', 'Mathematics', 'silver', 'Wafia Hasan Othoi', 'SFX Greenherald · 5', 9, 1),
  ('2025', 'Mathematics', 'bronze', 'Abdullah Abrar Wasi', 'Dhaka Residential · 5', 1, 1),
  ('2025', 'Mathematics', 'bronze', 'Abdullah Al Mueed Ahnaf', 'St. Joseph HSS · 5', 2, 1),
  ('2025', 'Mathematics', 'bronze', 'Abrar Jahin', 'St. Joseph HSS · 4', 3, 1),
  ('2025', 'Mathematics', 'bronze', 'Mahjabeen Binte Reza', 'Excel Academy · 5', 4, 1),
  ('2025', 'Mathematics', 'bronze', 'Md. Faiyaz Awsaf', 'St. Francis Xavier · 4', 5, 1),
  ('2025', 'Mathematics', 'bronze', 'Md. Samin Saif', 'St. Joseph HSS · 5', 6, 1),
  ('2025', 'Mathematics', 'bronze', 'Mohammad Ismail', 'St. Joseph HSS · 4', 7, 1),
  ('2025', 'Mathematics', 'bronze', 'Noyon Mondal', 'St. Joseph HSS · 5', 8, 1),
  ('2025', 'Mathematics', 'bronze', 'Priyangshu Riddhi Roy', 'SFX Greenherald · 5', 9, 1),
  ('2025', 'Mathematics', 'bronze', 'Ramiza Hasan', 'SFX Greenherald · 5', 10, 1),
  ('2025', 'Mathematics', 'bronze', 'Ratul Saha', 'St. Joseph HSS · 5', 11, 1),
  ('2025', 'Mathematics', 'bronze', 'Uddipto Biswas', 'St. Joseph HSS · 4', 12, 1),
  ('2025', 'Mathematics', 'bronze', 'Zarif Wahed', 'St. Joseph HSS · 5', 13, 1),
  ('2025', 'Science', 'gold', 'Aaqib Fattah Mustofi', 'St. Joseph Int''l · 5', 1, 1),
  ('2025', 'Science', 'gold', 'Ali Omar', 'St. Joseph HSS · 5', 2, 1),
  ('2025', 'Science', 'gold', 'Avigyan Roy Golpo', 'SFX Greenherald · 5', 3, 1),
  ('2025', 'Science', 'gold', 'Md. Miftahul Islam', 'Mymensingh Int''l · 4', 4, 1),
  ('2025', 'Science', 'gold', 'Syed Ayaan Isa', 'Lighthouse Int''l · 5', 5, 1),
  ('2025', 'Science', 'silver', 'Ahanaf Adib', 'St. Joseph Int''l · 5', 1, 1),
  ('2025', 'Science', 'silver', 'Arham Abid', 'Baseerah Int''l · 5', 2, 1),
  ('2025', 'Science', 'silver', 'Fariq Sahel Mustofi', 'St. Joseph Int''l · 4', 3, 1),
  ('2025', 'Science', 'silver', 'Md. Mahamudur Rahman', 'St. Joseph HSS · 4', 4, 1),
  ('2025', 'Science', 'silver', 'Md. Tahsin Ul Islam', 'St. Joseph Int''l · 5', 5, 1),
  ('2025', 'Science', 'silver', 'Noyon Mondal', 'St. Joseph HSS · 5', 6, 1),
  ('2025', 'Science', 'silver', 'Shahabi Ibn Kabbo', 'St. Joseph HSS · 5', 7, 1),
  ('2025', 'Science', 'silver', 'Taaseen Mahmud Farhan', 'St. Joseph HSS · 5', 8, 1),
  ('2025', 'Science', 'silver', 'Wafia Hasan Othoi', 'SFX Greenherald · 5', 9, 1),
  ('2025', 'Science', 'bronze', 'Ahnaf Adel Helali Foiz', 'Wheaton Int''l · 4', 1, 1),
  ('2025', 'Science', 'bronze', 'Arijit Saha', 'St. Joseph HSS · 5', 2, 1),
  ('2025', 'Science', 'bronze', 'Haris Al Fihri Aaban', 'St. Joseph HSS · 5', 3, 1),
  ('2025', 'Science', 'bronze', 'Mahbub Alam Khan Tahan', 'Daffodil Int''l · 5', 4, 1),
  ('2025', 'Science', 'bronze', 'Mahjabeen Binte Reza', 'Excel Academy · 5', 5, 1),
  ('2025', 'Science', 'bronze', 'Mohammad Jawad Khan', 'Daffodil Int''l · 5', 6, 1),
  ('2025', 'Science', 'bronze', 'Nuwaib Ashraf Samawat', 'Daffodil Int''l Uttara · 5', 7, 1),
  ('2025', 'Science', 'bronze', 'Priyangshu Riddhi Roy', 'SFX Greenherald · 5', 8, 1),
  ('2025', 'Science', 'bronze', 'Raihanur Emu', 'Daffodil Int''l · 5', 9, 1),
  ('2025', 'Science', 'bronze', 'Ratul Saha', 'St. Joseph HSS · 5', 10, 1),
  ('2025', 'Science', 'bronze', 'Shayan Murad Sarker', 'Glenrich Int''l · 4', 11, 1),
  ('2025', 'Science', 'bronze', 'Tahmid Hasan', 'Manarat Dhaka Int''l · 5', 12, 1);
