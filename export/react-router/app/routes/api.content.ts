import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { handleContent } from "../portfolio/server/api";

export const loader = ({ request }: LoaderFunctionArgs) => handleContent(request);
export const action = ({ request }: ActionFunctionArgs) => handleContent(request);
