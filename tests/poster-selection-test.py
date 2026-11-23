#!/usr/bin/env python3
"""Offline checks for poster eligibility and vote-count-first discovery."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / "scripts"))
import enrich_tmdb_posters as posters

class PopularPosterSelectionTests(unittest.TestCase):
    def test_vote_count_filter_prioritizes_well_known_movies(self):
        def fake_get(path,params,headers,auth):
            self.assertEqual(path,"/discover/movie")
            self.assertEqual(params["sort_by"],"vote_count.desc")
            self.assertEqual(params["vote_count.gte"],posters.MIN_TMDB_VOTES)
            if params["page"]!=1:
                return {"results":[]}
            return {"results":[
                {"id":10,"original_title":"Popular","vote_count":12000,"poster_path":"/a.jpg","popularity":90},
                {"id":20,"original_title":"Rare","vote_count":120,"poster_path":"/b.jpg","popularity":120},
                {"id":30,"original_title":"Already cached","vote_count":21000,"poster_path":"/c.jpg"},
                {"id":40,"original_title":"Missing poster","vote_count":9900,"poster_path":None}
            ]}
        with patch.object(posters.catalog_build,"get_json",side_effect=fake_get):
            rows=posters.top_voted_candidates({30},{}, {},10)
        self.assertEqual([row[0] for row in rows],[10])

if __name__=="__main__":
    unittest.main()
