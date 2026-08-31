"use client";

import { Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateUser } from "@/lib/auth-client";
import { initialsOf } from "@/lib/format";
import { removeMyAvatar, uploadMyAvatar } from "@/server/settings/actions";

type AvatarUploadFormProps = {
  user: { image: string | null; displayName: string };
  storageAvailable: boolean;
};

export function AvatarUploadForm({ user, storageAvailable }: AvatarUploadFormProps) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isRemoving, setIsRemoving] = React.useState(false);
  const busy = isUploading || isRemoving;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadMyAvatar(formData);

    if (!result.ok) {
      toast.error(result.error);
      setIsUploading(false);
      return;
    }

    await updateUser({ image: result.data.imageUrl });
    toast.success(result.message);
    setIsUploading(false);
    router.refresh();
  }

  async function handleRemove() {
    setIsRemoving(true);
    const result = await removeMyAvatar();

    if (!result.ok) {
      toast.error(result.error);
      setIsRemoving(false);
      return;
    }

    await updateUser({ image: null });
    toast.success(result.message);
    setIsRemoving(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile picture</CardTitle>
        <CardDescription>Shown next to your name across the console.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Avatar className="size-20">
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
            {initialsOf(user.displayName)}
          </AvatarFallback>
        </Avatar>

        {!storageAvailable ? (
          <p className="text-muted-foreground text-sm">File upload isn&apos;t available in this environment yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="size-4" aria-hidden />
                )}
                {user.image ? "Change photo" : "Upload photo"}
              </Button>
              {user.image ? (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleRemove}>
                  {isRemoving ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                  Remove
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">JPEG, PNG or WEBP. Up to 5 MB.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
