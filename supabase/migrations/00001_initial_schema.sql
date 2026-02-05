-- Users and auth
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  net_id TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  college TEXT,
  year INTEGER,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.donated_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_net_id TEXT NOT NULL,
  encrypted_cookies TEXT NOT NULL,
  target_systems TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  last_health_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CourseTable
CREATE TABLE public.courses (
  crn TEXT NOT NULL,
  season TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  instructors JSONB DEFAULT '[]',
  times JSONB DEFAULT '[]',
  locations JSONB DEFAULT '[]',
  skills TEXT[] DEFAULT '{}',
  areas TEXT[] DEFAULT '{}',
  credits NUMERIC(3,1),
  rating NUMERIC(3,2),
  workload NUMERIC(3,2),
  professor_rating NUMERIC(3,2),
  enrollment INTEGER,
  last_enrollment INTEGER,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (crn, season)
);

CREATE INDEX idx_courses_season ON public.courses(season);
CREATE INDEX idx_courses_code ON public.courses(code);
CREATE INDEX idx_courses_search ON public.courses USING GIN (to_tsvector('english', title || ' ' || code || ' ' || COALESCE(description, '')));

CREATE TABLE public.worksheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  name TEXT DEFAULT 'My Worksheet',
  courses TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_worksheets_user ON public.worksheets(user_id);

-- Yalies
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  net_id TEXT UNIQUE,
  upi INTEGER UNIQUE,
  email TEXT,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  college TEXT,
  year INTEGER,
  major TEXT,
  address TEXT,
  phone TEXT,
  photo_url TEXT,
  organization TEXT,
  title TEXT,
  scraped_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_people_name ON public.people USING GIN (to_tsvector('english', name));
CREATE INDEX idx_people_college ON public.people(college);
CREATE INDEX idx_people_year ON public.people(year);

-- YaleIMs
CREATE TABLE public.im_sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season_type TEXT NOT NULL CHECK (season_type IN ('fall', 'spring', 'winter'))
);

CREATE TABLE public.im_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college TEXT NOT NULL,
  sport_id UUID REFERENCES public.im_sports(id),
  season TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0
);

CREATE TABLE public.im_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id UUID REFERENCES public.im_sports(id),
  season TEXT NOT NULL,
  home_team_id UUID REFERENCES public.im_teams(id),
  away_team_id UUID REFERENCES public.im_teams(id),
  home_score INTEGER,
  away_score INTEGER,
  scheduled_at TIMESTAMPTZ,
  location TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled'))
);

-- Scraper tracking
CREATE TABLE public.scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  payload JSONB DEFAULT '{}',
  result JSONB,
  error TEXT,
  records_processed INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scrape_jobs_type ON public.scrape_jobs(job_type);
CREATE INDEX idx_scrape_jobs_status ON public.scrape_jobs(status);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worksheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users read own data" ON public.users FOR SELECT USING (true);
CREATE POLICY "Worksheets belong to user" ON public.worksheets FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Courses are public" ON public.courses FOR SELECT USING (true);
CREATE POLICY "People are public" ON public.people FOR SELECT USING (true);
