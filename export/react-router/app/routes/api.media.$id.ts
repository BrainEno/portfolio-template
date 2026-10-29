import type { LoaderFunctionArgs } from "react-router";
import { handleMedia } from "../portfolio/server/api";

export const loader = ({ params }: LoaderFunctionArgs) => handleMedia(params.id);
