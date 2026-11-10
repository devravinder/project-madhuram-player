import { Import } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { importMediaFile } from "@/services/importService";
import {
  canPlayInBrowser,
  MEDIA_ACCEPT,
  MEDIA_FORMATS_LABEL,
  mediaKindOf,
  withMediaType,
} from "@/services/mediaTypes";
import { toast } from "sonner";
export function UploadModal() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;

    const handleCancel = () => {
      setIsOpening(false);
    };

    input.addEventListener("cancel", handleCancel);

    return () => input.removeEventListener("cancel", handleCancel);
  }, []);

  const uploadFiles = async (files: FileList | File[]) => {
    const all = Array.from(files);
    const media = all.filter((file) => mediaKindOf(file));
    const skipped = all.filter((file) => !mediaKindOf(file));
    if (skipped.length > 0) {
      toast.error(
        `Skipped (not audio or video): ${skipped.map((f) => f.name).join(", ")}`,
      );
    }

    let imported = 0;
    for (const file of media) {
      const kind = mediaKindOf(file)!;
      try {
        await importMediaFile(file, kind);
        imported++;
        if (!canPlayInBrowser(withMediaType(file), kind)) {
          toast.warning(`${file.name} may not play in this browser`);
        }
      } catch (error) {
        console.error("Import failed:", file.name, error);
        toast.error(`Could not import ${file.name}`);
      }
    }

    if (imported > 0) {
      toast.success(`Imported ${imported} of ${all.length} files`);
      navigate({ to: "/library" });
    }
  };
  const onChange = async (files: FileList | null) => {
    if (!files || !files.item(0)) return;

    await uploadFiles(files);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    await uploadFiles(files);
  };

  const openFiles = () => {
    setIsOpening(true);
    fileInputRef.current?.click();
  };

  return (
    <div className="flex justify-center items-center">
      <div className="flex flex-col gap-4 p-4 justify-center">
        <div className="flex items-center justify-center">
          <h2 className="text-xl font-bold">Import Music and Videos</h2>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50"
          }`}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
            <Import size={32} className="text-muted-foreground" />
          </div>
          <p className="font-medium mb-2">Drag & drop audio or video files here</p>
          <p className="text-sm text-muted-foreground mb-4">
            Supports {MEDIA_FORMATS_LABEL}
          </p>
          <button
            onClick={openFiles}
            disabled={isOpening}
            className={`disabled:cursor-not-allowed cursor-pointer w-full flex items-center justify-center p-3 rounded-xl transition-colors bg-primary/10 text-primary`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={MEDIA_ACCEPT}
              className="hidden"
              multiple={true}
              onChange={(e) => {
                onChange?.(e.currentTarget.files);
                setIsOpening(false);
              }}
            />
            Choose Files
          </button>
        </div>
        <p className="text-xs text-center text-muted-foreground">
          Note: upload only audio or video files
        </p>
      </div>
    </div>
  );
}
