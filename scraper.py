import os
import re
import time
import datetime
import pandas as pd
from playwright.sync_api import sync_playwright

# 1. Robust relative path configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "songs")
CHANGELOG_FILE = os.path.join(BASE_DIR, "changelog.txt")
CATALOGUE_CSV = os.path.join(BASE_DIR, "catalogue.csv")
LW_MUSIC_CSV = os.path.join(BASE_DIR, "loveworldmusic-only.csv")

def clean_filename(title):
    """Sanitize song title to create a valid filename."""
    cleaned = re.sub(r'[\\/*?:"<>|]', "", str(title)).strip()
    return cleaned if cleaned else "Untitled_Song"

def log_changelog(message):
    """Append a timestamped message to the changelog file."""
    os.makedirs(BASE_DIR, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    print(log_entry.strip())
    with open(CHANGELOG_FILE, "a", encoding="utf-8") as f:
        f.write(log_entry)

# 2. Content-Aware Validation (Checks if file exists AND has valid content)
def is_valid_song_file(filepath):
    """Check if file exists and contains valid content (not empty/truncated/corrupt)."""
    if not os.path.exists(filepath):
        return False
    if os.path.getsize(filepath) < 50:  # Minimum byte threshold for headers + lyrics
        return False
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            if "TITLE:" not in content or "URL:" not in content:
                return False
    except Exception:
        return False
    return True

# 3. Network Resiliency (Exponential Backoff Retry)
def safe_goto(page, url, retries=3, delay=2):
    """Navigate with exponential backoff retry mechanism."""
    for attempt in range(1, retries + 1):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            return True
        except Exception as e:
            if attempt == retries:
                raise e
            time.sleep(delay * (2 ** (attempt - 1)))
    return False

# 4. Dynamic Pagination Crawler
def discover_new_songs(page, existing_urls):
    """Crawl pagination pages dynamically on loveworldlyrics.com to find new songs."""
    discovered = []
    log_changelog("Scanning online catalog for new songs (dynamic pagination)...")
    
    page_num = 1
    max_pages = 10  # safety ceiling
    while page_num <= max_pages:
        target_url = f"https://loveworldlyrics.com/page/{page_num}/" if page_num > 1 else "https://loveworldlyrics.com/"
        try:
            safe_goto(page, target_url)
            
            links = page.evaluate("""() => {
                const anchors = [...document.querySelectorAll('a[href*="/song/"]')]
                return anchors.map(a => ({
                    url: a.href,
                    title: a.innerText.trim() || a.href.split('/').filter(Boolean).pop()
                }));
            }""")
            
            if not links:
                break
                
            for item in links:
                u = item['url'].split('?')[0].rstrip('/')
                if u.lower() not in existing_urls:
                    slug = u.split('/')[-1]
                    discovered.append({
                        '#': len(existing_urls) + len(discovered) + 1,
                        'slug': slug,
                        'url': u,
                        'status': 'Newly Discovered',
                        'section labels': '',
                        'slides': 0,
                        'one-line slides': 0,
                        'groups': '',
                        'note': 'Auto-discovered by robust scraper'
                    })
                    existing_urls.add(u.lower())
            
            page_num += 1
        except Exception as e:
            log_changelog(f"Note: Pagination reached end or encountered error at page {page_num}: {e}")
            break
            
    return discovered

def scrape_song(url, site_type, page):
    safe_goto(page, url)
    
    if "loveworldmusic.org" in site_type or "loveworldmusic.org" in url:
        try:
            static_btn = page.locator("button", has_text=re.compile(r"^static$", re.IGNORECASE))
            if static_btn.count() > 0:
                static_btn.first.click()
                page.wait_for_timeout(1000)
        except Exception:
            pass

    try:
        page.wait_for_selector(".lyrics-scroll, .whitespace-pre-line, .entry-content", timeout=5000)
    except Exception:
        pass
    
    data = page.evaluate("""() => {
        const getTitle = () => {
            const stripSuffix = (s) => s.replace(/\\s+lyrics(\\s*&\\s*audio\\s*download)?\\s*$/i, '').trim();
            let dt = stripSuffix((document.title || '').split(/\\s+[—–|]\\s+/)[0].trim());
            if (dt && !/^loveworld/i.test(dt)) return dt;
            let h1 = stripSuffix((document.querySelector('h1')?.innerText || '').trim());
            if (h1 && !/^loveworld/i.test(h1)) return h1;
            return document.querySelector('meta[property="og:title"]')?.content || 'Untitled Song';
        };

        const scroll = document.querySelector('.lyrics-scroll');
        let content = '';
        if (scroll) {
            content = scroll.innerText;
        } else {
            const wpls = [...document.querySelectorAll('.whitespace-pre-line')];
            if (wpls.length) {
                content = wpls.map(w => w.innerText).join('\\n\\n');
            } else {
                const entry = document.querySelector('.entry-content') || document.querySelector('article') || document.body;
                content = entry ? entry.innerText : '';
            }
        }
        return { title: getTitle(), content: content };
    }""")
    
    return data['title'], data['content']

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    log_changelog("=== Robust Script Execution Started ===")

    if not os.path.exists(CATALOGUE_CSV):
        log_changelog(f"Error: {CATALOGUE_CSV} not found.")
        return

    # Load CSV datasets
    df_cat = pd.read_csv(CATALOGUE_CSV)
    df_lw = pd.read_csv(LW_MUSIC_CSV) if os.path.exists(LW_MUSIC_CSV) else pd.DataFrame(columns=['title', 'url'])
    
    log_changelog(f"Loaded {len(df_cat)} songs from catalogue.csv and {len(df_lw)} songs from loveworldmusic-only.csv.")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # Collect all known URLs to prevent duplicates
        existing_urls = set(df_cat['url'].astype(str).str.rstrip('/').str.lower())
        if 'url' in df_lw.columns:
            existing_urls.update(df_lw['url'].astype(str).str.rstrip('/').str.lower())
            
        # Discover new additions
        new_entries = discover_new_songs(page, existing_urls)
        
        if new_entries:
            new_df = pd.DataFrame(new_entries)
            df_cat = pd.concat([df_cat, new_df], ignore_index=True)
            df_cat.to_csv(CATALOGUE_CSV, index=False)
            log_changelog(f"Added {len(new_entries)} new song(s) to catalogue.csv.")
        else:
            log_changelog("No new songs found in online scan.")

        # Process and download missing songs
        new_count = 0
        skipped_count = 0
        error_count = 0
        
        tasks = []
        for _, row in df_cat.iterrows():
            tasks.append({
                'title': str(row.get('slug', 'song')).replace('-', ' ').title(),
                'url': row['url'],
                'type': 'catalogue'
            })
            
        for _, row in df_lw.iterrows():
            tasks.append({
                'title': row['title'],
                'url': row['url'],
                'type': 'loveworldmusic'
            })

        for index, task in enumerate(tasks):
            url = task['url']
            raw_title = task['title']
            site_type = task['type']
            
            filename = clean_filename(raw_title) + ".txt"
            filepath = os.path.join(OUTPUT_DIR, filename)
            
            # 5. Using validation check instead of basic os.path.exists
            if is_valid_song_file(filepath):
                skipped_count += 1
                continue
            
            log_changelog(f"[{index+1}/{len(tasks)}] Downloading/Repairing: {raw_title}")
            try:
                page_title, content = scrape_song(url, site_type, page)
                final_title = page_title if page_title and page_title != 'Untitled Song' else raw_title
                filename = clean_filename(final_title) + ".txt"
                filepath = os.path.join(OUTPUT_DIR, filename)
                
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(f"TITLE: {final_title}\nURL: {url}\n\n{content}")
                
                new_count += 1
            except Exception as e:
                error_count += 1
                log_changelog(f"Failed to scrape {url}: {e}")
                
        browser.close()
        
    log_changelog("=== Execution Complete ===")
    log_changelog(f"Summary -> Downloaded/Repaired: {new_count} | Valid (Skipped): {skipped_count} | Errors: {error_count}")
    print(f"\n[+] Changelog updated at: {CHANGELOG_FILE}")

if __name__ == "__main__":
    main()