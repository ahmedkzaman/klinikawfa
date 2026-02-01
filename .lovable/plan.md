
# Add Homepage Video Upload Feature

## Problem
The homepage has a VideoSection component that displays a placeholder message "📹 Video klinik akan ditambah di sini" but there's no admin interface to actually upload or manage this video.

## Solution
Add a video management section to the Admin Settings page where you can upload your clinic video. The video will be stored in Lovable Cloud storage and automatically display on the homepage.

---

## What Will Be Built

### 1. Video Upload in Admin Settings
A new "Homepage Video" card in the Settings page with:
- Upload button for video files (MP4, WebM, MOV)
- Video preview after upload
- Poster/thumbnail image upload option
- Delete video button
- File size limit: 50MB (suitable for short promotional videos)

### 2. Storage Configuration
- Create a new `videos` storage bucket for video files
- Configure proper public access for the homepage

### 3. Database Setting
- Add `homepage_video_url` and `homepage_video_poster` entries to `app_settings`

### 4. Update VideoSection
- Fetch the video URL from settings
- Show the actual video when available
- Keep the placeholder when no video is uploaded

---

## How It Will Work

```text
Admin Settings Page
+--------------------------------------------------+
|  Homepage Video                                  |
|  Upload a video to display on the homepage       |
+--------------------------------------------------+
|                                                  |
|  [Current Video Preview - if uploaded]           |
|                                                  |
|  +------------------------------------------+    |
|  | 📹 Drag & drop or click to upload        |    |
|  |    MP4, WebM, MOV (max 50MB)              |    |
|  +------------------------------------------+    |
|                                                  |
|  [Upload Poster Image (optional)]               |
|                                                  |
|  [Remove Video]                                  |
+--------------------------------------------------+
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `src/pages/admin/Settings.tsx` | Add video upload section with preview |
| `src/components/home/VideoSection.tsx` | Fetch video URL from settings, conditionally show video |

## Database Changes

| Change | Details |
|--------|---------|
| New storage bucket | `videos` (public) for storing clinic video |
| New app_settings entries | `homepage_video_url` and `homepage_video_poster` |
| RLS policies | Allow authenticated admin/staff to upload, public read |

---

## Technical Details

### Video Upload Handler
```typescript
const handleVideoUpload = async (file: File) => {
  // Validate file type and size (max 50MB)
  const filePath = `clinic/homepage-video.${ext}`;
  
  // Upload to 'videos' bucket
  await supabase.storage.from('videos').upload(filePath, file, {
    upsert: true // Replace existing
  });
  
  // Get public URL
  const { data } = supabase.storage.from('videos').getPublicUrl(filePath);
  
  // Save URL to app_settings
  await supabase.from('app_settings')
    .upsert({ key: 'homepage_video_url', value: data.publicUrl });
};
```

### VideoSection Update
```typescript
// In VideoSection component
const [videoUrl, setVideoUrl] = useState<string | null>(null);

useEffect(() => {
  const fetchVideo = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'homepage_video_url')
      .single();
    
    if (data?.value) setVideoUrl(data.value);
  };
  fetchVideo();
}, []);

// Render actual video if URL exists, otherwise show placeholder
```

---

## Implementation Order

1. Create `videos` storage bucket with RLS policies
2. Add `homepage_video_url` and `homepage_video_poster` to `app_settings`
3. Add video upload section to Settings page
4. Update VideoSection to fetch and display the video
5. Test upload and playback

---

## Supported Formats

| Format | MIME Type | Browser Support |
|--------|-----------|-----------------|
| MP4 | video/mp4 | All browsers |
| WebM | video/webm | Modern browsers |
| MOV | video/quicktime | Safari, some browsers |

**Recommendation**: Use MP4 (H.264) for best compatibility across all devices.
