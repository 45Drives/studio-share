# Flow by 45Studio

Flow by 45Studio is a secure file collaboration and transfer system designed for media-heavy workflows. It combines a desktop client with a Linux-based server service to enable:

- Secure file sharing over the internet
- Controlled upload portals for collaborators
- Local desktop uploads with optional proxy generation and watermarking
- Timecoded commenting and role-based permissions
- Centralized link management and logging

It is optimized for Linux servers, especially those using ZFS storage.

---

# Architecture Overview

Flow consists of two primary components.

## Desktop Client (Flow by 45Studio)

Supported platforms:

- Linux (Rocky/RHEL, Ubuntu/Debian)
- Windows
- macOS

The desktop client allows you to:

- Connect to your server
- Upload files locally
- Create share links
- Create upload links
- Manage users and roles
- Monitor transfers and logs
- Configure global link defaults

## Server API (`houston-broadcaster` service)

Installed on a Linux server.

Responsibilities:

- Link creation and validation
- Upload handling
- File serving
- Proxy generation
- Watermark processing
- Role-based permission enforcement
- Link access tracking
- Desktop client API communication

---

# Core Features

## Local Uploads

Upload files directly from your workstation to the server.

Options include:

- Proxy generation (720p, 1080p, Original)
- Watermarking for videos
- Parallel or sequential uploads
- Sharing raw + proxy files

Uploads can later be used to generate share links.

---

## Remote Uploads via Link

Create secure upload portals for collaborators.

Features:

- Restricted user accounts with defined permissions
- Role-based access (view, download, comment, upload)
- Forced password reset on first login
- Custom comment color per user
- Optional public commenting (no login required)
- Optional password-protected link
- Optional proxy generation and watermarking

---

## Share Files via Link

Generate secure links to share files or folders.

Features:

- Role-based access control
- Optional open commenting
- Password-protected links
- Proxy streaming
- Watermarking
- Expiration control
- LAN or internet access modes

---

# Application Walkthrough

---

# 1. Connection Screen

Displayed when launching the desktop app.

You may:

### Select a Detected Server
If `houston-broadcaster` is running and discoverable, it appears in the dropdown.

### Connect Manually
Provide:

- Server IP address
- SSH port (default 22)
- API port (default 9095)
- HTTPS port (default 443)
- Username
- Password

If sharing externally, ensure HTTPS port (typically 443) is open or forwarded on your router.

Click **Connect to Server** to proceed.

---

# 2. Dashboard

The central management interface.

Displays:

- Active links
- Link type (Upload or Share)
- Expiration
- Status (Active / Disabled)
- Access type (Open / Password / Restricted)
- Creation time

Actions:

- Search and filter links
- Refresh
- Edit expiration
- Disable or re-enable links
- Open link in browser
- View link details

Top navigation includes:

- Manage Users
- New File Share Link
- Upload Files Locally
- New Upload Link
- View Logs
- Settings

---

# 3. Transfer Dock

Displays active background processes:

- Local uploads
- Proxy generation
- Adaptive streaming preparation
- Watermark processing

Shows:

- Status (queued, running, done)
- Progress
- Speed
- ETA

Controls:

- Clear finished
- Minimize
- Dismiss individual tasks

---

# 4. Log Viewer

Parses and displays the local client log file.

Includes:

- Total entries
- Error count
- Warning count
- Info logs
- Debug logs

Tools:

- Search
- Filter by log level
- Group related events
- Expand detailed event data

Useful for diagnosing upload issues, API failures, and streaming errors.

---

# 5. Settings

Configure system-wide defaults for new links.

## Default Link Access

Choose between:

- Internal (LAN/VPN)
- External (Internet)

## External Share URL

- Auto-detect WAN IP
- Set custom domain
- Configure HTTPS port

Note: Custom domains require a valid TLS certificate on the server.

## Internal Share URL

- Auto-detect LAN IP
- Set internal base URL

## Default Link Options

- Restrict access to users
- Allow comments on open links
- Generate proxy files by default

Settings apply only to newly created links.

---

# 6. Manage Users

Create and manage user accounts.

User fields:

- Name
- Username
- Temporary password
- Email (optional)
- Default role
- Comment color

Users can be assigned to restricted links and must reset their password on first login.

---

# 7. Manage Roles

Define reusable permission templates.

Permissions:

- View
- Download
- Comment
- Upload

System roles include:

- Editor
- Feedback
- Viewer

Custom roles may also be created.

Roles determine what users can do inside links.

---

# 8. Project Selection

Select a ZFS pool or root directory before creating a share link.

You may:

- Choose a pool
- Navigate directories
- Display the full directory tree

This defines the source location of files being shared.

---

# 9. Create Share Link

Steps:

1. Select files or folders
2. Set expiration (hours, days, week, or never)
3. Enable proxy files (optional)
4. Enable watermark (optional)
5. Choose access mode (External or Local)
6. Restrict access to users (optional)
7. Set link title
8. Enable password protection (optional)

Click **Generate magic link** to create the share URL.

If proxy + watermark is selected and files are already processing, you may be prompted before overwriting.

---

# 10. Upload Files Locally

Steps:

1. Select local files
2. Choose server destination
3. Configure:
   - Proxy generation
   - Proxy qualities
   - Watermark
   - Raw + proxy sharing
4. Start upload

Transfers appear in the Transfer Dock.

---

# 11. Create Upload Link

Similar to Share Link, but used for receiving files.

Steps:

1. Choose destination folder
2. Set expiration
3. Configure access (restricted or open)
4. Enable proxy generation (optional)
5. Enable watermark (optional)
6. Enable password protection (optional)

Generates a secure upload portal for collaborators.

---

# 12. Share Link Viewer (Recipient View)

When a user opens a share link:

They can:

- Stream video (adaptive streaming if enabled)
- Download files
- View file versions
- See processing status
- Add timecoded comments
- Reply to comments
- Log in if required

If open commenting is enabled, visitors can enter a name and comment without logging in.

If restricted, login is required and permissions are enforced.

---

# 13. Upload Link Viewer (Recipient View)

Collaborators can:

- Drag and drop files
- Upload multiple files
- View upload progress
- Upload in parallel (if enabled)

If restricted:

- Must log in
- Must set password on first login

---

# Link Lifecycle

Links may be:

- Active
- Disabled
- Expired
- Modified

Administrators can:

- Edit expiration
- Update title
- Disable or re-enable links
- Review metadata
- Monitor usage

---

# Testing Checklist

## Local Uploads

- No proxy or watermark
- Proxy only (all qualities)
- Proxy + watermark
- Large file upload
- Parallel uploads

## Upload Links

Test combinations:

- Restricted vs open
- Each role (editor, feedback, viewer, custom)
- Comments enabled/disabled
- Password enabled/disabled
- Proxy enabled
- Proxy + watermark
- Multiple uploads
- Transcoding visibility in UI

## Share Links

Test:

- Each role type
- Open commenting
- Password protection
- Proxy generation
- Watermarking
- Viewing while transcode is in progress
- Viewing after transcode completes

---

# Security Model

- Links can expire
- Optional password protection
- Role-based access control
- HTTPS required for external access
- Server validates all requests
- Ports must be correctly opened or forwarded

---

# Recommended Deployment

Server:

- Linux (Rocky/RHEL preferred)
- ZFS-backed storage
- Valid TLS certificate for custom domains
- Port 443 exposed for external sharing

Client:

- Install on workstation
- Connect via SSH + API
- Manage collaboration from Dashboard

---

Flow by 45Studio provides a secure and controlled way to collaborate on media projects while maintaining clear permission boundaries and centralized management.
