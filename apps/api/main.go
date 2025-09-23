package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/gofiber/fiber/v2"
)

var allowedRoots = []string{
	"/mnt/roots/projects",
	"/mnt/roots/media",
}

type DirEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
	Size  int64  `json:"size"`
}

func isUnderAllowedRoots(p string) bool {
	rp, _ := filepath.EvalSymlinks(p)
	rp, _ = filepath.Abs(rp)
	for _, root := range allowedRoots {
		rr, _ := filepath.Abs(root)
		if rp == rr || (len(rp) > len(rr) && rp[:len(rr)] == rr && os.PathSeparator == rp[len(rr)]) {
			return true
		}
	}
	return false
}

func listDir(c *fiber.Ctx) error {
	p := c.Query("path")
	if p == "" {
		return c.Status(400).JSON(fiber.Map{"error": "path required"})
	}
	if !isUnderAllowedRoots(p) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden"})
	}

	f, err := os.Open(p)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	defer f.Close()

	infos, err := f.Readdir(-1)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	out := make([]DirEntry, 0, len(infos))
	for _, info := range infos {
		out = append(out, DirEntry{
			Name:  info.Name(),
			Path:  filepath.Join(p, info.Name()),
			IsDir: info.IsDir(),
			Size:  info.Size(),
		})
	}
	return c.JSON(out)
}

func main() {
	app := fiber.New()
	app.Get("/api/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"ok": true}) })
	app.Get("/api/fs/list", listDir)
	log.Fatal(app.Listen(":8080"))
}
