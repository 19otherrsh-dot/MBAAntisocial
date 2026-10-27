import type { IListing } from '@/models/campus/Listing';

type PopulatedListing = Omit<IListing, 'seller'> & { seller: { _id: unknown; name: string; image: string; batch: string } };

export function listingView(l: PopulatedListing, viewerId: string) {
  const isSeller = String(l.seller._id) === viewerId;
  return {
    _id: String(l._id),
    title: l.title,
    description: l.description,
    category: l.category,
    price: l.price,
    negotiable: l.negotiable,
    condition: l.condition,
    images: l.images,
    status: l.status,
    seller: { _id: String(l.seller._id), name: l.seller.name, image: l.seller.image, batch: l.seller.batch },
    isSeller,
    interestedCount: l.interested.length,
    imInterested: l.interested.some((u) => String(u) === viewerId),
    boosted: Boolean(l.boostedUntil && l.boostedUntil > new Date()),
    boostedUntil: isSeller ? l.boostedUntil ?? null : undefined,
    createdAt: l.createdAt,
  };
}
