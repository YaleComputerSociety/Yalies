import os
import re
import sys
import time
import requests
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional
from urllib.parse import urljoin
from pathlib import Path

from dotenv import load_dotenv
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from supabase import create_client

# Load .env from project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)


@dataclass
class Person:
  netId: Optional[str]
  upi: Optional[int]
  email: Optional[str]
  name: str
  firstName: Optional[str]
  lastName: Optional[str]
  college: Optional[str]
  year: Optional[int]
  major: Optional[str]
  pronouns: Optional[str]
  address: Optional[str]
  photoUrl: Optional[str]
  organization: Optional[str]
  title: Optional[str]


def _parse_class_year(raw: str) -> Optional[int]:
  match = re.search(r"'(\d{2})", raw.strip())
  if not match:
    return None
  year_suffix = int(match.group(1))
  return 2000 + year_suffix


def _split_name(raw: str) -> tuple[Optional[str], Optional[str]]:
  parts = [part.strip() for part in raw.split(",")]
  if len(parts) == 2:
    return parts[1] or None, parts[0] or None
  return None, None


def _extract_email(line: str) -> Optional[str]:
  match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", line)
  return match.group(0) if match else None


def _build_absolute_url(src: Optional[str]) -> Optional[str]:
  if not src:
    return None
  return urljoin("https://students.yale.edu", src)


def _extract_photo_id(src: Optional[str]) -> Optional[int]:
  """Extract the numeric photo ID from a URL like /facebook/Photo?id=541197"""
  if not src:
    return None
  match = re.search(r'id=(\d+)', src)
  if match:
    photo_id = int(match.group(1))
    # id=0 means no photo, don't use as identifier
    return photo_id if photo_id > 0 else None
  return None


def parse_student_card(card_html: str) -> Person:
  soup = BeautifulSoup(card_html, "html.parser")

  # Extract name from h5.yalehead
  name_el = soup.select_one(".student_name .yalehead")
  name = name_el.get_text(strip=True) if name_el else "Unknown"
  first_name, last_name = _split_name(name)

  # Extract pronouns
  pronouns_el = soup.select_one(".student_info_pronoun")
  pronouns = pronouns_el.get_text(strip=True) if pronouns_el else None
  pronouns = pronouns if pronouns else None  # Convert empty string to None

  # Extract year from .student_year (e.g., "'27" -> 2027)
  year_el = soup.select_one(".student_year")
  year = _parse_class_year(year_el.get_text(strip=True)) if year_el else None

  # Extract photo URL and photo ID
  photo_el = soup.select_one(".student_img img")
  photo_src = photo_el.get("src") if photo_el else None
  photo_url = _build_absolute_url(photo_src)
  photo_id = _extract_photo_id(photo_src)

  # Get ALL .student_info divs - first is college, second has details
  info_divs = soup.select(".student_info")
  
  college = None
  phone = None
  address_lines = []
  major = None
  
  if len(info_divs) >= 1:
    # First .student_info is the college
    college = info_divs[0].get_text(strip=True)
    if college and "College" not in college:
      # Sometimes there's no separate college div, it's all in one
      college = None
  
  if len(info_divs) >= 2:
    # Second .student_info contains phone / address / major / birthday
    detail_text = info_divs[1].get_text("\n")
    lines = [line.strip() for line in detail_text.split("\n") if line.strip()]
    
    for line in lines:
      # Phone number pattern like "6-2906" or "6-2906 /"
      if re.match(r'^6-\d{4}\s*/?', line):
        phone_match = re.match(r'^(6-\d{4})', line)
        if phone_match:
          phone = phone_match.group(1)
        continue
      
      # Skip birthday (month day pattern like "Dec 29", "Sep 3")
      if re.match(r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$', line):
        continue
      
      # Major detection - common major keywords
      major_keywords = [
        'Science', 'Studies', 'Engineering', 'History', 'Economics', 'Mathematics',
        'Psychology', 'Biology', 'Chemistry', 'Physics', 'Computer', 'Political',
        'English', 'Art', 'Music', 'Philosophy', 'Sociology', 'Anthropology',
        'Linguistics', 'Neuroscience', 'Cognitive', 'Global', 'Affairs', 
        'Biomedical', 'Electrical', 'Mechanical', 'Chemical', 'Applied',
        'Undeclared', 'Ecology', 'Molecular', 'Biochem', 'Statistics'
      ]
      if major is None and any(kw in line for kw in major_keywords):
        major = line
        continue
      
      # Everything else is likely address
      address_lines.append(line)
  
  # Join address lines
  address = ", ".join(address_lines) if address_lines else None
  
  # Use photo_id as UPI if we don't have other identifiers
  # This gives us a unique identifier for deduplication
  upi = photo_id

  return Person(
    netId=None,  # Not available from this page
    upi=upi,
    email=None,  # Not available from this page
    name=name,
    firstName=first_name,
    lastName=last_name,
    college=college,
    year=year,
    major=major,
    pronouns=pronouns,
    address=address,
    photoUrl=photo_url,
    organization=None,
    title=phone  # Store phone in title field temporarily
  )


def batch(iterable: Iterable[Person], size: int) -> Iterable[list[Person]]:
  chunk: list[Person] = []
  for item in iterable:
    chunk.append(item)
    if len(chunk) >= size:
      yield chunk
      chunk = []
  if chunk:
    yield chunk


def dedupe_people(people: list[Person]) -> list[Person]:
  seen = set()
  unique: list[Person] = []
  for person in people:
    # Use UPI (photo ID) as primary key - it's unique per student
    # Fall back to name only if UPI is missing (shouldn't happen normally)
    if person.upi:
      key = f"upi:{person.upi}"
    elif person.netId:
      key = f"netid:{person.netId}"
    else:
      # Last resort: use name + year + college for uniqueness
      key = f"name:{person.name}|{person.year}|{person.college}"
    
    if key in seen:
      continue
    seen.add(key)
    unique.append(person)
  return unique


def save_people_to_supabase(people: list[Person], supabase) -> None:

  payload = []
  for person in people:
    payload.append(
      {
        "net_id": person.netId,
        "upi": person.upi,
        "email": person.email,
        "name": person.name,
        "first_name": person.firstName,
        "last_name": person.lastName,
        "college": person.college,
        "year": person.year,
        "major": person.major,
        "address": person.address,
        "photo_url": person.photoUrl,
        "organization": person.organization,
        "title": person.title,
        "scraped_at": datetime.utcnow().isoformat()
      }
    )

  if not payload:
    return

  on_conflict = "net_id" if any(p.netId for p in people) else "upi"
  supabase.table("people").upsert(payload, on_conflict=on_conflict).execute()


def ensure_photo_bucket(supabase, bucket: str) -> None:
  existing = supabase.storage.list_buckets()
  if any(getattr(item, "name", None) == bucket or (isinstance(item, dict) and item.get("name") == bucket) for item in existing):
    return
  supabase.storage.create_bucket(bucket, options={"public": True})


def _photo_key(person: Person) -> str:
  if person.netId:
    return person.netId
  if person.upi:
    return str(person.upi)
  return re.sub(r"[^a-zA-Z0-9_-]+", "_", person.name)


def upload_photos(driver, supabase, bucket: str, people: list[Person]) -> None:
  """Upload photos using requests library with cookies from selenium session."""
  # Get cookies from selenium session for authenticated requests
  cookies = {cookie['name']: cookie['value'] for cookie in driver.get_cookies()}
  session = requests.Session()
  session.cookies.update(cookies)
  
  for person in people:
    if not person.photoUrl:
      continue

    try:
      response = session.get(person.photoUrl, timeout=30)
      if response.status_code != 200:
        continue

      content_type = response.headers.get("content-type", "image/jpeg")
      extension = "jpg"
      if "png" in content_type:
        extension = "png"
      if "gif" in content_type:
        extension = "gif"

      file_path = f"{_photo_key(person)}.{extension}"
      file_bytes = response.content

      supabase.storage.from_(bucket).upload(
        file_path,
        file_bytes,
        file_options={"content-type": content_type, "upsert": "true"}
      )

      public_url = supabase.storage.from_(bucket).get_public_url(file_path)
      person.photoUrl = public_url
    except Exception as e:
      print(f"Error uploading photo for {person.name}: {e}", flush=True)


def scroll_and_load_all(driver, max_iterations: int = 100) -> int:
  """Scroll down repeatedly until no new content loads."""
  prev_count = 0
  stable_iterations = 0
  
  for i in range(max_iterations):
    # Get current count of student cards
    cards = driver.find_elements(By.CSS_SELECTOR, ".student_container")
    current_count = len(cards)
    
    print(f"Iteration {i+1}: Found {current_count} students", flush=True)
    
    # Check if we've stopped loading new content
    if current_count == prev_count:
      stable_iterations += 1
      if stable_iterations >= 3:
        print(f"No new content after {stable_iterations} scrolls, stopping.", flush=True)
        break
    else:
      stable_iterations = 0
    
    prev_count = current_count
    
    # Scroll to bottom
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(1.5)
    
    # Try clicking "Load More" button if it exists
    try:
      load_more_selectors = [
        "button:contains('Load More')",
        "a:contains('Load More')",
        ".load-more",
        "#loadMore"
      ]
      for selector in load_more_selectors:
        try:
          elements = driver.find_elements(By.CSS_SELECTOR, selector)
          if elements:
            elements[0].click()
            time.sleep(2)
            break
        except:
          pass
    except:
      pass
  
  return prev_count


def main() -> None:
  # Target page for scraping student data
  # Using currentIndex=-1&numberToGet=-1 to request all students at once
  target_url = "https://students.yale.edu/facebook/PhotoPageNew?currentIndex=-1&numberToGet=-1"
  supabase_url = os.environ["SUPABASE_URL"]
  supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
  photo_bucket = os.environ.get("SUPABASE_PHOTO_BUCKET", "yalies-photos")
  supabase = create_client(supabase_url, supabase_key)
  ensure_photo_bucket(supabase, photo_bucket)

  # Set up Chrome options
  chrome_options = Options()
  # Don't run headless so user can log in
  chrome_options.add_argument("--start-maximized")
  chrome_options.add_argument("--disable-blink-features=AutomationControlled")
  chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
  chrome_options.add_experimental_option("useAutomationExtension", False)
  
  print("Starting Chrome browser...", flush=True)
  driver = webdriver.Chrome(options=chrome_options)
  
  # Remove webdriver property to avoid detection
  driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
  
  try:
    print("Navigating to Yale Facebook...", flush=True)
    driver.get("https://students.yale.edu/facebook/")
    
    print("=" * 60, flush=True)
    print("PLEASE LOG IN with CAS + Duo in the Chrome window.", flush=True)
    print("The script will automatically continue after login.", flush=True)
    print("=" * 60, flush=True)
    
    # Wait for successful login by monitoring URL change
    max_wait = 300  # 5 minutes max wait for login
    start_time = time.time()
    
    while True:
      elapsed = time.time() - start_time
      if elapsed > max_wait:
        print("Timeout waiting for login. Please try again.", flush=True)
        return
      
      try:
        current_url = driver.current_url
        if current_url is None:
          print("Browser may have been closed. Waiting...", flush=True)
          time.sleep(2)
          continue
        
        # Check if logged in - URL should be on students.yale.edu/facebook without CAS
        # Extract just the host/path part (before query string) for "cas" check
        url_base = current_url.split('?')[0].lower()
        has_facebook = "students.yale.edu/facebook" in current_url
        no_cas_in_host = "cas.yale" not in current_url.lower() and "its.yale.edu/cas" not in current_url.lower()
        no_duo = "duosecurity" not in current_url.lower()
        
        if has_facebook and no_cas_in_host and no_duo:
          print(f"Login detected! URL: {current_url}", flush=True)
          break
        
        # Show waiting status every 5 seconds
        if int(elapsed) % 5 == 0:
          print(f"Waiting for login... ({int(elapsed)}s) - URL: {current_url[:50]}...", flush=True)
        
      except Exception as e:
        print(f"Error checking browser: {e}", flush=True)
      
      time.sleep(1)
    
    print(f"Login complete. Current URL: {current_url}", flush=True)
    time.sleep(2)  # Brief pause after login

    # Navigate to the photo page
    print(f"Navigating to {target_url}...", flush=True)
    driver.get(target_url)
    print("Waiting for page to load (this may take a while for all students)...", flush=True)
    time.sleep(10)  # Longer wait for all students to load
    
    print(f"Current URL after navigation: {driver.current_url}", flush=True)
    
    # Wait for initial content to load
    try:
      WebDriverWait(driver, 30).until(  # Increased timeout for loading all students
        EC.presence_of_element_located((By.CSS_SELECTOR, ".student_container"))
      )
      print("Found student containers!", flush=True)
    except:
      print("No student containers found initially, checking page content...", flush=True)
      print(f"Current URL: {driver.current_url}", flush=True)
      print(f"Page title: {driver.title}", flush=True)
      try:
        body_text = driver.find_element(By.TAG_NAME, "body").text[:500]
        print(f"Page content preview: {body_text}", flush=True)
      except:
        print("Could not get page content", flush=True)
    
    # Scroll and load all content
    print("Loading all students (scrolling to load more)...", flush=True)
    total_students = scroll_and_load_all(driver)
    print(f"Finished loading. Total students found: {total_students}", flush=True)

    # Now parse all cards
    cards = driver.find_elements(By.CSS_SELECTOR, ".student_container")
    print(f"Parsing {len(cards)} student cards...", flush=True)
    
    # Add a progress indicator overlay to the page
    driver.execute_script("""
      var progressDiv = document.createElement('div');
      progressDiv.id = 'scrape-progress';
      progressDiv.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #1a73e8; color: white; padding: 15px 20px; border-radius: 8px; font-family: Arial, sans-serif; font-size: 16px; z-index: 99999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
      progressDiv.innerHTML = 'Scraping: 0 / ' + arguments[0];
      document.body.appendChild(progressDiv);
    """, len(cards))
    
    people = []
    for i, card in enumerate(cards):
      try:
        # Highlight the current card being scraped (green = success)
        driver.execute_script("""
          arguments[0].style.backgroundColor = '#4CAF50';
          arguments[0].style.transition = 'background-color 0.3s';
          arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});
        """, card)
        
        card_html = card.get_attribute("outerHTML")
        person = parse_student_card(card_html)
        people.append(person)
        
        # Update progress indicator
        driver.execute_script("""
          var progress = document.getElementById('scrape-progress');
          if (progress) {
            progress.innerHTML = 'Scraping: ' + arguments[0] + ' / ' + arguments[1];
          }
        """, i + 1, len(cards))
        
        # Debug: print first 5 students
        if i < 5:
          print(f"Student {i}: name={person.name}, upi={person.upi}, year={person.year}, college={person.college}, major={person.major}", flush=True)
        if (i + 1) % 100 == 0:
          print(f"Parsed {i + 1}/{len(cards)} students...", flush=True)
      except Exception as e:
        # Highlight failed cards in red
        try:
          driver.execute_script("arguments[0].style.backgroundColor = '#f44336';", card)
        except:
          pass
        print(f"Error parsing card {i}: {e}", flush=True)
    
    # Update progress to show completion
    driver.execute_script("""
      var progress = document.getElementById('scrape-progress');
      if (progress) {
        progress.style.backgroundColor = '#4CAF50';
        progress.innerHTML = 'Scraping complete! ' + arguments[0] + ' students';
      }
    """, len(people))
    
    people = dedupe_people(people)
    print(f"After deduplication: {len(people)} unique people", flush=True)

    # Upload photos in batches
    print("Uploading photos to Supabase Storage...", flush=True)
    driver.execute_script("""
      var progress = document.getElementById('scrape-progress');
      if (progress) {
        progress.style.backgroundColor = '#ff9800';
        progress.innerHTML = 'Uploading photos: 0 / ' + arguments[0];
      }
    """, len(people))
    
    uploaded_count = 0
    for i, chunk in enumerate(batch(people, 50)):
      upload_photos(driver, supabase, photo_bucket, chunk)
      uploaded_count += len(chunk)
      driver.execute_script("""
        var progress = document.getElementById('scrape-progress');
        if (progress) {
          progress.innerHTML = 'Uploading photos: ' + arguments[0] + ' / ' + arguments[1];
        }
      """, uploaded_count, len(people))
      print(f"Uploaded photos for batch {i + 1} ({len(chunk)} people)", flush=True)

    # Save to database in batches
    print("Saving people to Supabase database...", flush=True)
    driver.execute_script("""
      var progress = document.getElementById('scrape-progress');
      if (progress) {
        progress.style.backgroundColor = '#9c27b0';
        progress.innerHTML = 'Saving to database: 0 / ' + arguments[0];
      }
    """, len(people))
    
    saved_count = 0
    for chunk in batch(people, 200):
      save_people_to_supabase(chunk, supabase)
      saved_count += len(chunk)
      driver.execute_script("""
        var progress = document.getElementById('scrape-progress');
        if (progress) {
          progress.innerHTML = 'Saving to database: ' + arguments[0] + ' / ' + arguments[1];
        }
      """, saved_count, len(people))
      print(f"Saved {saved_count}/{len(people)} people to database", flush=True)
      time.sleep(0.5)

    # Final success message
    driver.execute_script("""
      var progress = document.getElementById('scrape-progress');
      if (progress) {
        progress.style.backgroundColor = '#4CAF50';
        progress.innerHTML = '✓ COMPLETE: ' + arguments[0] + ' people saved!';
        progress.style.fontSize = '18px';
      }
    """, len(people))
    
    print(f"COMPLETE: Saved {len(people)} people to Supabase", flush=True)
    time.sleep(5)  # Keep browser open briefly to show completion
  
  finally:
    driver.quit()


if __name__ == "__main__":
  main()
