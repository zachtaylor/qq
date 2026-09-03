-- Seed data: well-known public-domain authors and quotes.
-- Run after schema.sql.

insert into authors (name, slug, bio, born_year, died_year) values
  ('Marcus Aurelius', 'marcus-aurelius', 'Roman emperor and Stoic philosopher, author of Meditations.', 121, 180),
  ('Mark Twain', 'mark-twain', 'American writer and humorist.', 1835, 1910),
  ('Maya Angelou', 'maya-angelou', 'American poet and civil rights activist.', 1928, 2014),
  ('Albert Einstein', 'albert-einstein', 'Theoretical physicist.', 1879, 1955),
  ('Oscar Wilde', 'oscar-wilde', 'Irish poet and playwright.', 1854, 1900),
  ('Confucius', 'confucius', 'Chinese philosopher and teacher.', -551, -479),
  ('Ralph Waldo Emerson', 'ralph-waldo-emerson', 'American essayist and poet.', 1803, 1882),
  ('Lao Tzu', 'lao-tzu', 'Ancient Chinese philosopher, reputed author of the Tao Te Ching.', null, null),
  ('Jane Austen', 'jane-austen', 'English novelist.', 1775, 1817),
  ('Winston Churchill', 'winston-churchill', 'British statesman and wartime Prime Minister.', 1874, 1965),
  ('Eleanor Roosevelt', 'eleanor-roosevelt', 'American political figure and activist.', 1884, 1962),
  ('Aristotle', 'aristotle', 'Greek philosopher.', -384, -322),
  ('Helen Keller', 'helen-keller', 'American author and disability rights advocate.', 1880, 1968),
  ('Henry David Thoreau', 'henry-david-thoreau', 'American essayist and naturalist.', 1817, 1862),
  ('Friedrich Nietzsche', 'friedrich-nietzsche', 'German philosopher.', 1844, 1900);

insert into quotes (text, author_id) values
  ('You have power over your mind, not outside events. Realize this, and you will find strength.', (select id from authors where slug = 'marcus-aurelius')),
  ('The impediment to action advances action. What stands in the way becomes the way.', (select id from authors where slug = 'marcus-aurelius')),
  ('Waste no more time arguing about what a good man should be. Be one.', (select id from authors where slug = 'marcus-aurelius')),

  ('The secret of getting ahead is getting started.', (select id from authors where slug = 'mark-twain')),
  ('The two most important days in your life are the day you are born and the day you find out why.', (select id from authors where slug = 'mark-twain')),
  ('Kindness is the language which the deaf can hear and the blind can see.', (select id from authors where slug = 'mark-twain')),

  ('I''ve learned that people will forget what you said, people will forget what you did, but people will never forget how you made them feel.', (select id from authors where slug = 'maya-angelou')),
  ('If you don''t like something, change it. If you can''t change it, change your attitude.', (select id from authors where slug = 'maya-angelou')),
  ('Try to be a rainbow in someone''s cloud.', (select id from authors where slug = 'maya-angelou')),

  ('Life is like riding a bicycle. To keep your balance, you must keep moving.', (select id from authors where slug = 'albert-einstein')),
  ('Imagination is more important than knowledge.', (select id from authors where slug = 'albert-einstein')),
  ('A person who never made a mistake never tried anything new.', (select id from authors where slug = 'albert-einstein')),

  ('Be yourself; everyone else is already taken.', (select id from authors where slug = 'oscar-wilde')),
  ('We are all in the gutter, but some of us are looking at the stars.', (select id from authors where slug = 'oscar-wilde')),
  ('To live is the rarest thing in the world. Most people exist, that is all.', (select id from authors where slug = 'oscar-wilde')),

  ('It does not matter how slowly you go as long as you do not stop.', (select id from authors where slug = 'confucius')),
  ('Our greatest glory is not in never falling, but in rising every time we fall.', (select id from authors where slug = 'confucius')),
  ('Choose a job you love, and you will never have to work a day in your life.', (select id from authors where slug = 'confucius')),

  ('Do not go where the path may lead, go instead where there is no path and leave a trail.', (select id from authors where slug = 'ralph-waldo-emerson')),
  ('What lies behind us and what lies before us are tiny matters compared to what lies within us.', (select id from authors where slug = 'ralph-waldo-emerson')),
  ('The only person you are destined to become is the person you decide to be.', (select id from authors where slug = 'ralph-waldo-emerson')),

  ('A journey of a thousand miles begins with a single step.', (select id from authors where slug = 'lao-tzu')),
  ('When I let go of what I am, I become what I might be.', (select id from authors where slug = 'lao-tzu')),
  ('Nature does not hurry, yet everything is accomplished.', (select id from authors where slug = 'lao-tzu')),

  ('It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.', (select id from authors where slug = 'jane-austen')),
  ('I declare after all there is no enjoyment like reading!', (select id from authors where slug = 'jane-austen')),

  ('Success is not final, failure is not fatal: it is the courage to continue that counts.', (select id from authors where slug = 'winston-churchill')),
  ('Attitude is a little thing that makes a big difference.', (select id from authors where slug = 'winston-churchill')),
  ('We make a living by what we get, but we make a life by what we give.', (select id from authors where slug = 'winston-churchill')),

  ('The future belongs to those who believe in the beauty of their dreams.', (select id from authors where slug = 'eleanor-roosevelt')),
  ('No one can make you feel inferior without your consent.', (select id from authors where slug = 'eleanor-roosevelt')),
  ('Do one thing every day that scares you.', (select id from authors where slug = 'eleanor-roosevelt')),

  ('Knowing yourself is the beginning of all wisdom.', (select id from authors where slug = 'aristotle')),
  ('We are what we repeatedly do. Excellence, then, is not an act, but a habit.', (select id from authors where slug = 'aristotle')),
  ('It is the mark of an educated mind to be able to entertain a thought without accepting it.', (select id from authors where slug = 'aristotle')),

  ('Life is either a daring adventure or nothing at all.', (select id from authors where slug = 'helen-keller')),
  ('Alone we can do so little; together we can do so much.', (select id from authors where slug = 'helen-keller')),
  ('The best and most beautiful things in the world cannot be seen or even touched — they must be felt with the heart.', (select id from authors where slug = 'helen-keller')),

  ('Go confidently in the direction of your dreams. Live the life you have imagined.', (select id from authors where slug = 'henry-david-thoreau')),
  ('It''s not what you look at that matters, it''s what you see.', (select id from authors where slug = 'henry-david-thoreau')),
  ('Rather than love, than money, than fame, give me truth.', (select id from authors where slug = 'henry-david-thoreau')),

  ('He who has a why to live can bear almost any how.', (select id from authors where slug = 'friedrich-nietzsche')),
  ('That which does not kill us makes us stronger.', (select id from authors where slug = 'friedrich-nietzsche')),
  ('Without music, life would be a mistake.', (select id from authors where slug = 'friedrich-nietzsche'));
